import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { fetchPublicPage, sourceFromSearch, track, type PublicData } from '../lib/public'
import { PublicPage } from '../components/PublicPage'
import { brandingUrl } from '../lib/db'

/** /gc/:slug — página pública (sem login). */
export default function PublicGc() {
  const { slug = '' } = useParams()
  const { search } = useLocation()
  const [data, setData] = useState<PublicData | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const source = sourceFromSearch(search)

  useEffect(() => {
    let off = false
    setData(undefined); setFailed(false)
    fetchPublicPage(slug.toLowerCase()).then(d => { if (!off) { setData(d); if (d) track(d.group.slug, 'page_view', undefined, source) } }).catch(() => { if (!off) setFailed(true) })
    return () => { off = true }
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <Centered title="Não foi possível carregar" text="Verifique sua conexão e tente novamente." action={<button className="underline" onClick={() => location.reload()}>Tentar novamente</button>} />
  if (data === undefined) return <div role="status" className="flex min-h-screen items-center justify-center bg-[#FAFAF8] text-sm text-[#5f5d57]">Carregando…</div>
  if (data === null) return <Centered title="Página não encontrada" text="Este endereço não existe ou a página não está publicada." />
  const logo = brandingUrl(data.group.logo_path)
  return (
    <>
      <Helmet>
        <title>{data.group.name}</title>
        <meta name="description" content={(data.page.bio || data.group.description || `Página do ${data.group.name}`).slice(0, 160)} />
        <meta property="og:title" content={data.group.name} />
        {logo && <meta property="og:image" content={logo} />}
        <meta name="theme-color" content={data.group.primary_color} />
      </Helmet>
      <PublicPage data={data} source={source} onClickLink={id => track(data.group.slug, 'link_click', id, source)} />
    </>
  )
}

function Centered({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#FAFAF8] px-6 text-center text-[#232323]"><h1 className="text-xl font-bold">{title}</h1><p className="text-sm text-[#5f5d57]">{text}</p>{action}</div>
}
