import { Injectable, TemplateRef } from "@angular/core";

@Injectable({providedIn: 'root'})
export class HeaderService {
    
    public templateRef: TemplateRef<any> | null

    constructor() {}

    public setTemplateRef(templateRef: TemplateRef<any>){
      this.templateRef = templateRef
    }
  
    public clearTemplateRef(){
      this.templateRef = null
    }
}