# Blueprint Smartsite — graao

**Uma pergunta. Uma solução. Um mercado. Uma conversão.**

```mermaid
graph TD
 H[Homepage: Marketing 360 Brasil] --> C[Camada 1: Core]
 H --> F[Camada 2: Funcionalidades]
 H --> U[Camada 3: Soluções e casos de uso]
 C --> T[Planos, demo, suporte, comunidade, legal]
 F --> P[CRM, sites, automações, recursos verificados]
 U --> Q[Agências, empresas, captação, vendas, atendimento]
 P --> Q
 Q --> P
 P --> X[Conversão real]
 Q --> X
 T --> X
```

O hub fortalece a entidade e responde a pergunta central. Spokes por recurso e caso de uso aprofundam a mesma oferta. Não há páginas de localidade, matrizes artificiais nem quantidade mínima de URLs. Toda página exige intenção distinta, evidência, links e próximo passo. O inventário proposto em docs/04-sitemap.md deve ser auditado antes da implementação/publicação.
