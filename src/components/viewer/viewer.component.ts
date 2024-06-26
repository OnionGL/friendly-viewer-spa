import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { ViewerService } from "../../services/viewer/viewer.service";
import { ModalService } from "../../services/modal/modal.service";
import { AddFileModalComponent } from "../modalComponents/addFileModal/addFile.component";
import { AddUserModalComponent } from "../modalComponents/addUserModal/addUser.component";
import { Socket } from "ngx-socket-io";
import { ActivatedRoute, Router } from "@angular/router";
import { BehaviorSubject, Observable, Subscription, catchError, delay, finalize, first, forkJoin, fromEvent, map, merge, of, scan, share, shareReplay, startWith, switchMap, tap, timer } from "rxjs";
import { UserApiService } from "../../api-services/users/users.service";
import { UserService } from "../../services/user/user.service";
import { FileUploadService } from "../../api-services/fileUpload/fileUpload.service";
import { ImagesService } from "../../services/image/images.servise";
import { RoomApiService } from "../../api-services/room/roomApi.service";
import { DomSanitizer, SafeUrl } from "@angular/platform-browser";
import { TUser } from "../../types/user";
import { AlertService, AlertTypes } from "../../services/alert/alertService.service";
import { CookieService } from "ngx-cookie-service";

@Component({
    selector: 'viewer-component',
    templateUrl: 'viewer.component.html',
    styleUrl: 'viewer.component.scss'
})


export class ViewerComponent implements OnDestroy , AfterViewInit {

    @ViewChild('videoPlayer') videoPlayer: any

    @HostListener('window:beforeunload', ['$event'])
    doSomething($event: any) {
        this.ngOnDestroy()
        $event.returnValue = 'Вы уверены, что хотите покинуть страницу?';
    }

    @HostListener('window:unload', ['$event'])
    unloadHandler($event: any): void {
        // this.ngOnDestroy(); // Вызов логики очистки
        // $event.returnValue = 'Вы уверены, что хотите покинуть страницу?';
    }

    constructor(
        private viewerService: ViewerService,
        private modalService: ModalService, 
        private socket: Socket, 
        private activeRoute: ActivatedRoute,
        public userService: UserService,
        private userApiService: UserApiService,
        private imagesService: ImagesService,
        private roomApiService: RoomApiService,
        private uploadService: FileUploadService,
        private sanitizer: DomSanitizer,
        private router: Router,
        private alertService: AlertService,
        private cookie: CookieService,
        private cdr: ChangeDetectorRef
    ){}

    public videoData: Observable<SafeUrl>

    public usersInRoom: Observable<Array<any>>

    public isLoadingSubject: BehaviorSubject<boolean> = new BehaviorSubject(false)
    
    private roomId: string
    
    private subscriptions: Subscription[] = []

    private historyDataChanges: Observable<any>

    private currentTime: number = 0

    public adminId: number = null

    public currentUserId: number

    public ngAfterViewInit() {
        this.initUsersList()
        this.initAdminInRoom()
        this.initWebSocketsData()
        this.initHistoryData()
        this.initVideoFromWebSocket()
        this.initWebSocketVideoController()
        this.initCurrentTimeVideo()
        this.initVideo()
        this.initRemoveUsers()
    }


    private initRemoveUsers() {
        this.socket.fromEvent("removeUserId")
            .pipe(
                switchMap(removeUserId => this.userApiService.get(Number(removeUserId)).pipe(
                    tap(_ => !this.currentUserId && this.initAdminInRoom()),
                    delay(1000),
                    tap(user => {
                        if(user.id == this.currentUserId && !user.isGuest) {
                            this.router.navigate(['home'])
                        } else if(user.id == this.currentUserId && user.isGuest) {
                            this.cookie.delete("token")
                            this.router.navigate(['login'])
                        }
                    })
                ))
            )
            .subscribe()
    }

    private initAdminInRoom() {
        this.activeRoute.params
            .pipe(
                switchMap(({roomId}) => this.roomApiService.getAdminId(roomId)),
            )
            .subscribe(data => {
                this.adminId = data.adminId
            })
        this.userService.currentUser
            .pipe(
                first(),
                catchError(err => of(null))
            )
            .subscribe(({id}) => {
                this.currentUserId = id
            })
        
    }

    private initCurrentTimeVideo() {
        this.socket.fromEvent<{currentTime: number}>("changesCurrentTimeVideo")
            .pipe(
                    map(({currentTime}) => {
                            this.videoPlayer.nativeElement.currentTime = currentTime
                    }),
            )
            .subscribe(_ => {
                
            })

    }

    private initWebSocketVideoController() {
        this.socket.fromEvent("allStart")
            .subscribe(_ => {
                setTimeout(() => {
                    this.videoPlayer.nativeElement.play()
                })
            })
    
        this.socket.fromEvent("allPause")
            .subscribe(_ => {
                setTimeout(() => {
                    this.videoPlayer.nativeElement.pause()
                })  
            })
    }

    public ngOnDestroy(): void {
        this.userService.currentUser
            .pipe(first())
            .subscribe(user => this.socket.emit("leaveRoom" , {roomId: this.roomId , currentUserId: user.id , adminId: this.adminId}))
    }

    public exitRoom(){
        this.userService.currentUser
            .pipe(
                first(),
                switchMap(({id}) => this.userApiService.get(id))
            )
            .subscribe(user => {
                    this.socket.emit("leaveRoom" , {roomId: this.roomId , currentUserId: user.id , adminId: this.adminId , alertMessage: `Пользователь ${user?.name ?? 'unknown'} покинул комнату` , alertType: AlertTypes.WARNING})
                    if(user.isGuest) {
                        this.router.navigate(['login'])
                    } else {
                        this.router.navigate(['home'])
                    }
                }
            )
    }

    public timeUpdateController(event: any) {
        this.socket.emit('timerUpdate' , {roomId: this.roomId , time: event.target.currentTime} )
    }


    private initVideo() { 

        this.activeRoute.params.pipe(
            switchMap(({roomId}) => {
                return this.roomApiService.getVideo(roomId).pipe(
                    tap(_ => this.isLoadingSubject.next(true)),
                    switchMap(data => {
                        if(!data?.videoId) return of(null)
                        return this.uploadService.get(data.videoId)
                    }),
                    map(file => {
                        if(!file) return null
                        const videoBlob = new Blob([new Uint8Array(file.data.data)], { type: 'video/mp4' });;
                        const videoUrl = URL.createObjectURL(videoBlob);
                        return this.sanitizer.bypassSecurityTrustUrl(videoUrl)
                    }),
                    tap(_ => this.isLoadingSubject.next(false)),
                    first()
                )
            }),
            tap(file => {
                if(file) {
                    this.videoData = of(file).pipe(
                        map(_ => file)
                    )
                }
            }),
            switchMap(file => this.socket.fromEvent<{roomId: string , time: number}>("timerUpload").pipe(
                first(),
                tap(({time}) => {
                    if(file) {  
                            this.videoPlayer.nativeElement.currentTime = time
                            this.videoPlayer.nativeElement.play()
                    }
                }),
                map(_ => file)
        ))
        ).subscribe(() => {
        })
        setTimeout(() => {
            this.cdr.detectChanges()
        } , 1000)
    }

    private initVideoFromWebSocket() {
        this.videoData = this.socket.fromEvent<{videoId: number}>("addingVideo").pipe(
            tap(_ => this.isLoadingSubject.next(true)),
            switchMap(({videoId}) => {
                return this.uploadService.get(videoId)
            }),
            map(file => {
                const videoBlob = new Blob([new Uint8Array(file.data.data)], { type: 'video/mp4' });;
                const videoUrl = URL.createObjectURL(videoBlob);
                return this.sanitizer.bypassSecurityTrustUrl(videoUrl)
            }),
            tap(_ => this.isLoadingSubject.next(false)),
            shareReplay({refCount: false , bufferSize: 1})
        )
    }

    public playerController(event: any) {
        
        if(event?.type == "play") {
            this.socket.emit("playVideo" , {roomId: this.roomId})
        }
        
        if(event?.type == "pause") {
            this.socket.emit("pauseVideo" , {roomId: this.roomId})
        }
    }

    public timerController(event: any) {
        if(event.target.currentTime !== this.currentTime) {
            this.currentTime = event.target.currentTime 
            this.socket.emit("changeCurrentTimeVideo" , {roomId: this.roomId , currentTime: event.target.currentTime})
        }
    }

    private initHistoryData() {
        this.socket.on("history" , (history: string[]) => {
            this.historyDataChanges = of(history)
        })
    }

    private initUsersList() {

        this.usersInRoom = this.socket.fromEvent<number[]>("joinedRoom").pipe(
            switchMap(userIds => {
                const getCurrentUsersChanges = userIds.map(userId => {
                   return this.userApiService.get(userId).pipe(
                        switchMap(user => {
                            const imageId = user?.imageId

                            if(imageId) {
                                return this.imagesService.getImageById(imageId).pipe(
                                    map(image =>({...user , image}))
                                )
                            }

                            return of(user)

                        })
                   )
                }) 



                return forkJoin(getCurrentUsersChanges)
            }),
        )
    }

    public removeUser = (user: TUser) => {
        this.socket.emit("removeUsers" , {roomId: this.roomId , removeUserId: user?.id , alertMessage: `Пользователь ${user?.name ?? 'unknown'} был выгнан из комнаты`})
    }

    private initWebSocketsData() {
            this.activeRoute.params
                .pipe(
                    first(),
                    switchMap(({roomId}) => {
                        this.roomId = roomId
                        return this.userService.currentUser.pipe(
                            catchError(err => {
                                if(err.statusText == "Unauthorized") {
                                    return of("Unauthorized")
                                }
                                throw new Error("Error")
                            }),
                            switchMap((data): Observable<TUser> => {
                                if(data == "Unauthorized") {
                                    return this.userApiService.createGuestUser().pipe(
                                        first()
                                    )
                                }

                                const user = data as TUser

                                return this.userApiService.get(user.id)
                            }),
                            tap(user => {
                                    this.socket.emit("joinRoom" , {
                                        roomId,
                                        currentUserId: user.id,
                                        alertMessage: `Пользователь ${user?.name ?? "Unknown"} зашел в комнату!`,
                                        alertType: "SUCCESS"
                                    })
                                    this.socket.emit("joinRoom" , {
                                        roomId,
                                        currentUserId: user.id,
                                    })
                            }),
                        )
                    }),
                )
                .subscribe(_ => {                })
                window.addEventListener("onbeforeunload", () => {
                    this.ngOnDestroy()
                });
    }
    

    public openAddVideoPopup() {
        this.modalService.createDialog(AddFileModalComponent , {roomId: this.roomId} , {maxWidth: '500px' , maxHeight: '200px' , height: '100%'})
    }

    public openAddUserPopup() {
        this.modalService.createDialog(AddUserModalComponent , {roomId: this.roomId} , {maxWidth: '500px' , maxHeight: '200px' , height: '100%'})
    }

}