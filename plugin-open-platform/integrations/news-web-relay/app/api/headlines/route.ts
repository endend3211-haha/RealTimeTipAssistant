import {api,options} from '../../../lib/api.mjs';
export const dynamic='force-dynamic';
export function GET(request:Request){return api(request,'headlines');}
export function OPTIONS(){return options();}
