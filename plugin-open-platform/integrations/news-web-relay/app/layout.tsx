import type {Metadata} from 'next';import './globals.css';
export const metadata:Metadata={title:'Memo 뉴스 웹 중계',description:'공개 기사 웹페이지를 읽어 MemoMind 안경에 전달합니다.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
