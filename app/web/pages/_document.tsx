import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="zh-CN" suppressHydrationWarning>
      <Head>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=JSON.parse(localStorage.getItem('infosphere_theme')||'{}');var d=document.documentElement;d.setAttribute('data-primary',s.primary_hue||'blue');d.setAttribute('data-radius',s.radius||'lg');d.setAttribute('data-btn',s.button_size||'md');d.setAttribute('data-font',s.font_size||'15');d.setAttribute('data-width',s.content_width||'normal');d.setAttribute('data-nav',s.nav_height||'64');d.setAttribute('data-sidebar',s.sidebar_width||'260');d.setAttribute('data-bg',s.page_bg||'#F7F6F2')}catch(e){var d=document.documentElement;d.setAttribute('data-primary','blue');d.setAttribute('data-radius','lg');d.setAttribute('data-btn','md');d.setAttribute('data-font','15');d.setAttribute('data-width','normal');d.setAttribute('data-nav','64');d.setAttribute('data-sidebar','260');d.setAttribute('data-bg','#F7F6F2')}})()`,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
