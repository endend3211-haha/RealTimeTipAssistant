import {api,options} from '../../../lib/api.mjs';
export const dynamic='force-dynamic';
export function GET(request:Request){return api(request,'health');}
export function OPTIONS(){return options();}
