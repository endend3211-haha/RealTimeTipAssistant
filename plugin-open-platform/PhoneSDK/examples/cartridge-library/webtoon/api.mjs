export const DEFAULT_BASE = 'https://korea-webtoon-api-cc7dda2f0d77.herokuapp.com';
export const JIKAN_BASE = 'https://api.jikan.moe/v4';
export const providers = { NAVER: '네이버웹툰', KAKAO: '카카오웹툰', KAKAO_PAGE: '카카오페이지', JIKAN: 'Jikan 만화 정보' };
export function apiUrl(base, { keyword = '', provider = '', updateDay = '', page = 1, perPage = 20 } = {}) {
  const url = new URL(base.replace(/\/$/, '') + '/webtoons');
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('API 주소는 HTTPS 주소를 입력해 주세요.');
  if (provider && !['NAVER','KAKAO','KAKAO_PAGE'].includes(provider)) throw new Error('지원하지 않는 플랫폼입니다.');
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(perPage) || perPage < 1 || perPage > 100) throw new Error('페이지 범위를 확인해 주세요.');
  url.searchParams.set('page', page); url.searchParams.set('perPage', perPage); url.searchParams.set('sort', 'ASC');
  if (keyword.trim()) url.searchParams.set('keyword', keyword.trim());
  if (provider) url.searchParams.set('provider', provider);
  if (updateDay) url.searchParams.set('updateDay', updateDay);
  return url;
}
export function safeHttps(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
export function normalizePage(data) {
  if (!data || !Array.isArray(data.webtoons) || typeof data.isLastPage !== 'boolean') throw new Error('웹툰 API 응답 형식이 올바르지 않습니다.');
  const webtoons = data.webtoons.filter(item => typeof item.title === 'string' && item.title.trim()).map(item => ({
    id: String(item.id ?? ''), title: item.title.slice(0, 300), provider: String(item.provider ?? ''),
    authors: Array.isArray(item.authors) ? item.authors.filter(x => typeof x === 'string') : [],
    thumbnail: Array.isArray(item.thumbnail) ? item.thumbnail.map(safeHttps).filter(Boolean) : [],
    url: item.source === 'JIKAN' ? '' : safeHttps(item.url), source: item.source === 'JIKAN' ? 'JIKAN' : 'KOREA',
    catalogUrl: safeHttps(item.catalogUrl), synopsis: typeof item.synopsis === 'string' ? item.synopsis.slice(0,10000) : '',
    updateDays: Array.isArray(item.updateDays) ? item.updateDays : [], isEnd: item.isEnd === true,
  }));
  return { webtoons, total: Math.max(0, Number(data.total) || 0), isLastPage: data.isLastPage };
}
export function jikanUrl(base, { keyword='', page=1, perPage=20, top=false, id }={}) {
  const url = new URL(base.replace(/\/$/,'')+(id!==undefined?`/manga/${Number(id)}`:top?'/top/manga':'/manga'));
  if(url.protocol!=='https:'||url.username||url.password||!Number.isInteger(page)||page<1||!Number.isInteger(perPage)||perPage<1||perPage>25)throw new Error('Jikan 요청 범위를 확인해 주세요.');
  if(id!==undefined){if(!Number.isSafeInteger(Number(id))||Number(id)<1)throw new Error('만화 번호를 확인해 주세요.');return url;}
  url.searchParams.set('page',page);url.searchParams.set('limit',perPage);if(!top&&keyword.trim())url.searchParams.set('q',keyword.trim());return url;
}
export function normalizeJikan(data, detail=false) {
  const rows=detail?[data?.data]:data?.data;
  if(!Array.isArray(rows))throw new Error('Jikan 응답 형식이 올바르지 않습니다.');
  return {webtoons:rows.filter(row=>row&&typeof row.title==='string').map(row=>({
    id:String(row.mal_id),title:row.title,source:'JIKAN',provider:'JIKAN',authors:Array.isArray(row.authors)?row.authors.map(x=>x.name).filter(x=>typeof x==='string'):[],
    thumbnail:[row.images?.jpg?.image_url].filter(x=>typeof x==='string'),url:'',catalogUrl:row.url,synopsis:row.synopsis||'',
  })),total:data.pagination?.items?.total||rows.length,isLastPage:detail||data.pagination?.has_next_page!==true};
}
