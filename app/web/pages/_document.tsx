import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="zh-CN" suppressHydrationWarning>
      <Head>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=JSON.parse(localStorage.getItem('infosphere_theme')||'{}');document.documentElement.setAttribute('data-primary',s.primary_hue||'blue');document.documentElement.setAttribute('data-radius',s.radius||'lg')}catch(e){document.documentElement.setAttribute('data-primary','blue');document.documentElement.setAttribute('data-radius','lg')}})()`,
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
