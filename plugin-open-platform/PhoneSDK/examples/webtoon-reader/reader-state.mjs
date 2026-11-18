// Read state is committed only after receiver ACK. Visiting previous pages
// never moves the furthest-read bookmark backwards.
export class ReadingPosition {
 constructor(count=0,saved=-1){this.count=count;this.current=0;this.furthest=Math.min(Math.max(-1,saved),count-1);}
 acknowledge(page){if(Number.isInteger(page)&&page>=0&&page<this.count)this.furthest=Math.max(this.furthest,page);}
 nextUnread(){return Math.min(this.count-1,Math.max(this.current,this.furthest)+1);}
 previous(){return Math.max(0,this.current-1);}
}
