## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
_GS=""
for _D in "${GSTACK_ROOT:-}" "$HOME/.claude/skills/gstack" "$HOME/.codex/skills/gstack" "$HOME/.factory/skills/gstack" "$HOME/.kiro/skills/gstack" "$HOME/.config/opencode/skills/gstack" "$HOME/.slate/skills/gstack" "$HOME/.cursor/skills/gstack" "$HOME/.openclaw/skills/gstack" "$HOME/.hermes/skills/gstack" "$HOME/.gbrain/skills/gstack" "$HOME/.copilot/skills/gstack" "$HOME/.gemini/antigravity-cli/skills/gstack" "$HOME/.gemini/skills/gstack" "$HOME/.gstack/repos/gstack"; do
  [ -z "$_GS" ] && [ -n "$_D" ] && [ -d "$_D/bin" ] && _GS="$_D"
done
[ -n "$_GS" ] && echo "GSTACK_OK: $_GS" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

Using gstack skills: After install, skills like /qa, /ship, /review
and /browse are available. Use /browse for all web browsing (Aside first, the bundled gstack browser as fallback).
Use the resolved install path above for gstack file paths
(default: ~/.claude/skills/gstack).

The Skill gate in .claude/settings.json runs .claude/hooks/check-gstack.cjs with
Node.js and blocks when it cannot run. If a skill is blocked with "node: not
found", tell the user to install Node.js (https://nodejs.org); if it is blocked
with "Cannot find module ... check-gstack.cjs", the hook file is missing from
this checkout. Do not work around either block.

## Documentação de toda entrega (doc.graao.com)

Toda ferramenta nova ou melhoria visível para quem usa a graao cria ou atualiza o artigo da central de ajuda **no mesmo PR**:

1. Artigo em `docs-site/src/content/docs/<grupo>/<artigo>.mdx`, seguindo o modelo `docs-site/src/content/docs/_modelo.mdx` (para que serve, requisitos, vídeo, passo a passo com um print por passo, automações ligadas, perguntas frequentes, veja também).
2. Uma linha no topo de `docs-site/src/content/docs/comece-aqui/novidades.mdx` (`### AAAA-MM-DD · Título`, uma frase e o link do artigo).
3. Prints e vídeos no R2 público: `npm run docs:midia -- enviar <pasta> <grupo> <artigo>` e `npm run docs:midia -- verificar`. Prints só da Agência Demo local, nunca de dados reais de clientes.
4. Se o editor de workflows mudou (`ui/workflow-data.js`), rode `npm run docs:catalogo`. Depois de criar ou renomear um artigo, rode `npm run docs:secoes` (atualiza os cartões da página da seção) e marque o artigo em `docs-site/cobertura.json`.
5. Se a mudança não aparece para quem usa a graao, escreva no corpo do PR: `Documentação: não se aplica — <motivo>`.

O CI (workflow "Documentação", `.github/workflows/docs.yml`, que roda de novo ao editar o corpo do PR) reprova o PR que muda `ui/`, `routes/` ou `*-model.mjs` sem artigo e sem essa linha.

Comandos: `npm run docs:dev` (site local), `npm run docs:build`, `npm run docs:test`.
Design: `docs/superpowers/specs/2026-11-24-doc-graao-design.md`.
