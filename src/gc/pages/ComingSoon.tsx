import { Hourglass } from 'lucide-react'
import { EmptyState, PageHeader } from '../components/ui-kit'

export default function ComingSoon({ title, stage, description }: { title: string; stage: number; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={Hourglass} title="Módulo ainda não disponível"
        description={`${description} Este módulo está previsto para a Etapa ${stage} do plano de implementação e ainda não foi construído.`} />
    </>
  )
}
