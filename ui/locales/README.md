# Catálogo de Traduções / Locales do Graao

Este diretório contém os catálogos completos de tradução de toda a plataforma Graao.

## Idiomas Disponíveis
- **Português (Brasil)**: `pt.js` (idioma canônico; as chaves de todos os catálogos são os textos em português)
- **Español Latinoamericano**: `es.js` (es-419), importado por `ui/i18n.js`

Cada catálogo é um módulo `export default { "texto em português": "tradução" }`. Não há cópia `.json`: edite só o `.js`. Depois de editar, rode `node scripts/sync-public.mjs` para atualizar o espelho em `public/`.

---

## Como Adicionar um Novo Idioma no Futuro (Ex: Inglês 'en', Francês 'fr')

Para adicionar qualquer novo idioma à plataforma, o processo é simples e 100% modular:

### Passo 1: Criar o arquivo de tradução
Copie o catálogo canônico com o código do novo idioma (ex.: `en.js` ou `fr.js`):
```bash
cp ui/locales/pt.js ui/locales/en.js
```

### Passo 2: Traduzir os valores
No novo arquivo `en.js`, mantenha as chaves em português idênticas e substitua os valores pelo texto traduzido no idioma de destino.
Exemplo:
```javascript
export default {
  "Configurações": "Settings",
  "Meu perfil": "My profile",
  "Salvar alterações": "Save changes"
};
```

### Passo 3: Registrar o idioma em `i18n.js`
Abra `ui/i18n.js` e adicione o idioma na lista `languages`:
```javascript
import enDict from './locales/en.js';

export const languages = [
  { id: 'pt', label: 'Português', flag: 'PT' },
  { id: 'es', label: 'Español Latino', flag: 'ES' },
  { id: 'en', label: 'English', flag: 'EN' } // Novo idioma aqui!
];

registerLanguage('en', {
  label: 'English',
  flag: 'EN',
  translations: enDict
});
```

Pronto! O seletor visual na barra superior (`langToggle`), o menu de configurações e o sistema de tradução automática do DOM (`translateDom`) passarão a suportar o novo idioma instantaneamente.
