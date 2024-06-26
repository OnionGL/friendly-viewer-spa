
import { Injectable } from "@angular/core";
import { Socket } from "ngx-socket-io";
import { Observable, Subject, delay, map, of, shareReplay, skip, switchMap, tap, timer } from "rxjs";

export enum AlertTypes {
    WARNING="WARNING",
    SUCCESS="SUCCESS",
    ERROR="ERROR"
}

type AlertParams = {
    content: string,
    duration?: number,
    type?: AlertTypes
}

@Injectable({providedIn: 'root'})
export class AlertService {

    public alertChanges: Observable<AlertParams>

    public alertType: AlertTypes

    private alertSubject: Subject<AlertParams> = new Subject()

    constructor(
        private socket: Socket, 
    ) {
        this.initAlertChanges()
        this.initAlertSocketChanges()
    }

    public createAlert(params: AlertParams) {

        const timerChanges = timer(params?.duration ?? 3000).pipe(
            tap(_ => this.alertSubject.next(null))
        )

        const timerSubscription = timerChanges.subscribe(_ => {
            this.alertType = null
            timerSubscription.unsubscribe()
        })

        this.alertType = params?.type ?? AlertTypes.SUCCESS

        this.alertSubject.next(params)
    }

    private initAlertSocketChanges() {
        this.socket.fromEvent<{message: string , alertType: AlertTypes}>("alertMessages")
            .subscribe(({message , alertType}) => {
                this.createAlert({
                    content: message,
                    type: alertType ?? AlertTypes.SUCCESS
                })
            })
    }

    private initAlertChanges() {

        this.alertChanges = this.alertSubject.pipe(
            map(params => {
                if(!params) return null
                if(!params?.type) return {...params , type: AlertTypes.SUCCESS} 
                return params
            }),
            shareReplay({refCount: true , bufferSize: 1})
        )

    }

}