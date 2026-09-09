import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="zh-CN" suppressHydrationWarning>
      <Head>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=JSON.parse(localStorage.getItem('infosphere_theme')||'{}');var d=document.documentElement;d.setAttribute('data-primary',s.primary_hue||'blue');if(s.primary_hue==='custom'&&s.custom_color){d.setAttribute('data-custom-color',s.custom_color);d.style.setProperty('--custom-color',s.custom_color)}d.setAttribute('data-radius',s.radius||'lg');if(s.radius==='custom'&&s.custom_radius){d.style.setProperty('--radius',s.custom_radius)}d.setAttribute('data-btn',s.button_size||'md');if(s.button_size==='custom'&&s.custom_control_height){d.style.setProperty('--control-height',s.custom_control_height)}d.setAttribute('data-font',s.font_size||'15');if(s.font_size==='custom'&&s.custom_font_size){d.style.setProperty('--font-size',s.custom_font_size)}d.setAttribute('data-width',s.content_width||'normal');if(s.content_width==='custom'&&s.custom_content_width){d.style.setProperty('--content-max-width',s.custom_content_width)}d.setAttribute('data-nav',s.nav_height||'64');if(s.nav_height==='custom'&&s.custom_nav_height){d.style.setProperty('--nav-height',s.custom_nav_height)}d.setAttribute('data-sidebar',s.sidebar_width||'260');if(s.sidebar_width==='custom'&&s.custom_sidebar_width){d.style.setProperty('--sidebar-width',s.custom_sidebar_width)}if(s.page_bg==='custom'&&s.custom_page_bg){d.style.setProperty('--page-bg',s.custom_page_bg)}else{d.style.setProperty('--page-bg',s.page_bg||'#F7F6F2')}}catch(e){var d=document.documentElement;d.setAttribute('data-primary','blue');d.setAttribute('data-radius','lg');d.setAttribute('data-btn','md');d.setAttribute('data-font','15');d.setAttribute('data-width','normal');d.setAttribute('data-nav','64');d.setAttribute('data-sidebar','260');d.style.setProperty('--page-bg','#F7F6F2')}})()`,
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
