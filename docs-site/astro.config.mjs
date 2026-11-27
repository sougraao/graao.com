// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';
import starlightLinksValidator from 'starlight-links-validator';

export default defineConfig({
  site: 'https://doc.graao.com',
  integrations: [
    starlight({
      title: 'Central de ajuda do Graao',
      description: 'Documentação do graao para agências: como usar cada ferramenta da plataforma, passo a passo.',
      logo: { src: './src/assets/logo-graao.svg', alt: 'Graao' },
      favicon: '/favicon.svg',
      defaultLocale: 'root',
      locales: { root: { label: 'Português', lang: 'pt-BR' } },
      customCss: ['./src/styles/graao.css'],
      components: { Footer: './src/components/Rodape.astro' },
      lastUpdated: true,
      social: [],
      sidebar: [
        { label: 'Comece aqui', items: [{ autogenerate: { directory: 'comece-aqui' } }] },
        { label: 'Agência', items: [{ autogenerate: { directory: 'agencia' } }] },
        { label: 'Configurações', items: [{ autogenerate: { directory: 'configuracoes' } }] },
        { label: 'CRM', items: [{ autogenerate: { directory: 'crm' } }] },
        { label: 'Conversas e canais', items: [{ autogenerate: { directory: 'conversas' } }] },
        { label: 'Agendas', items: [{ autogenerate: { directory: 'agendas' } }] },
        { label: 'Automações', items: [{ autogenerate: { directory: 'automacoes' } }] },
        { label: 'Sites e conteúdo', items: [{ autogenerate: { directory: 'sites' } }] },
        { label: 'Marketing', items: [{ autogenerate: { directory: 'marketing' } }] },
        { label: 'Reputação', items: [{ autogenerate: { directory: 'reputacao' } }] },
        { label: 'Pagamentos e documentos', items: [{ autogenerate: { directory: 'pagamentos' } }] },
        { label: 'Cursos e comunidades', items: [{ autogenerate: { directory: 'cursos' } }] },
        { label: 'Inteligência artificial', items: [{ autogenerate: { directory: 'ia' } }] },
        { label: 'Relatórios', items: [{ autogenerate: { directory: 'relatorios' } }] },
        { label: 'Apps e integrações', items: [{ autogenerate: { directory: 'apps' } }] },
        { label: 'Suporte e conformidade', items: [{ autogenerate: { directory: 'suporte' } }] },
      ],
      plugins: [starlightLlmsTxt(), starlightLinksValidator()],
    }),
  ],
});
