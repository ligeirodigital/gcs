import { Helmet } from 'react-helmet-async'

/** Política de privacidade dos formulários públicos. Texto-base: revise com assessoria jurídica da igreja. */
export default function Privacy() {
  return (
    <main className="min-h-screen bg-[#FAFAF8] px-5 py-10 text-[#232323]">
      <Helmet><title>Política de privacidade — GC Digital</title></Helmet>
      <article className="mx-auto max-w-2xl space-y-4 text-[15px] leading-relaxed">
        <h1 className="text-2xl font-bold">Política de privacidade</h1>
        <p className="text-sm text-[#5f5d57]">Versão v1 · aplicável aos formulários das páginas públicas dos GCs (Lei nº 13.709/2018, LGPD).</p>
        <h2 className="pt-2 text-lg font-semibold">Quem trata os seus dados</h2>
        <p>O GC e a igreja responsáveis pela página em que você preencheu o formulário. A plataforma GC Digital atua como operadora, fornecendo a infraestrutura.</p>
        <h2 className="pt-2 text-lg font-semibold">Quais dados coletamos e para quê</h2>
        <p>Somente o que você informar: nome, telefone e/ou e-mail e, quando houver, a mensagem ou o pedido de oração. A finalidade é exclusivamente retornar o seu contato, convidar você para os encontros e acompanhar o seu interesse. A base legal é o seu consentimento, registrado com data e versão deste texto.</p>
        <p>Não solicitamos informações sensíveis. Evite incluir diagnósticos, dados de saúde ou detalhes íntimos de terceiros nas mensagens.</p>
        <h2 className="pt-2 text-lg font-semibold">Quem acessa</h2>
        <p>Apenas a liderança e a equipe de acolhimento autorizadas do GC. Os dados não são vendidos nem compartilhados para publicidade.</p>
        <h2 className="pt-2 text-lg font-semibold">Por quanto tempo guardamos</h2>
        <p>Contatos de visitantes: até 12 meses. Pedidos de oração e mensagens: até 6 meses. Depois disso, os dados pessoais são anonimizados.</p>
        <h2 className="pt-2 text-lg font-semibold">Seus direitos</h2>
        <p>Você pode pedir confirmação do tratamento, acesso, correção, anonimização, eliminação dos dados e revogar o consentimento a qualquer momento, falando com a liderança do GC pelos canais divulgados na página.</p>
        <h2 className="pt-2 text-lg font-semibold">Métricas da página</h2>
        <p>Medimos visualizações e cliques de forma agregada, sem guardar o seu endereço de IP ou outros identificadores em claro.</p>
      </article>
    </main>
  )
}
