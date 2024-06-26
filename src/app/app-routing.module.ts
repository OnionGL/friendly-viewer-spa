import { Component, NgModule } from '@angular/core';
import { Router, RouterModule, Routes } from '@angular/router';
import { CookieService } from 'ngx-cookie-service';
import { LoginService } from '../services/login/login.service';
import { ViewerComponent } from '../components/viewer/viewer.component';
import { LoginComponent } from '../components/login/login.component';
import { PersonalAreaComponent } from '../components/personal-area/personal-area.component';
import { CreateRoomComponent } from '../components/create-room/createRoom.component';
import { UserService } from '../services/user/user.service';

@Component({template: ''})
export class RedirectStartPageComponent {
  constructor(private router: Router,
              private userService: UserService, 
              private cookie: CookieService,
              private loginService: LoginService 
            ){
        if(this.cookie.get('token')) {
          this.loginService.getCurrentUserByToken(this.cookie.get('token')).subscribe(user => {
            userService.currentUser = user
            router.navigate([`createRoom`])
          })  
        } else {
          router.navigate(['login'])
        }
    }
}

const routes: Routes = [
  {
    path: 'room/:roomId',
    component: ViewerComponent,

  },
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: 'personalArea',
    component: PersonalAreaComponent
  },
  {
    path: 'createRoom',
    component: CreateRoomComponent
  },
  {
    path: '**',
    component: RedirectStartPageComponent
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})

export class AppRoutingModule { }
