// Endereço público da mídia da documentação, sem dependências: os componentes do site importam daqui,
// para o build do projeto da documentação não precisar de nenhum arquivo fora de docs-site/.
export const MIDIA_BASE = 'https://midia.graao.com';
// Prévia local: DOCS_MIDIA_BASE=/midia-local serve a mídia de docs-site/public/midia-local (ver `docs:midia -- local`).
export const midiaBase = (env = process.env) => String(env.DOCS_MIDIA_BASE || MIDIA_BASE).replace(/\/+$/, '');
