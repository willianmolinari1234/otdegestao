# Plano de migração do banco de dados

Estado: **proposta**. Nada foi executado.
Ver `ESQUEMA-DE-DADOS.md` para o retrato atual.

---

## O que está errado hoje

| # | Problema | Impacto | Risco de corrigir |
|---|---|---|---|
| 1 | `financeiro` existe mas está **vazia** | código e regra mantidos à toa | **baixo** |
| 2 | Idiomas misturados nas coleções | confunde quem lê o código | alto |
| 3 | Idiomas misturados nos campos | idem | alto |
| 4 | "cliente" significa **duas coisas** | erro de interpretação | médio |
| 5 | ~~Comissão em dois lugares~~ | ✅ resolvido: herda do proprietário | — |

O item 4 é o mais perigoso na prática: no cadastro, *cliente* é o
**proprietário**; nos dados de venda, o campo `cliente` é a **loja**.
Foi exatamente o que causou o erro de conectar a WSX Pet no lugar da SHG.

---

## Sequência recomendada

### Fase A — limpeza sem risco
- [ ] Remover a coleção `financeiro` (vazia), suas regras e o endpoint
      `syncFinanceiro`, que nunca chegou a ser usado.
- [ ] Remover endpoints de diagnóstico já cumpridos: `compararVendas`,
      `inspecionarPedidos`, `financeiroDia`.

**Ganho:** menos superfície de ataque e menos código morto.
**Risco:** nenhum — nada lê essas coleções/endpoints.

### Fase B — renomear campos internos (sem tocar em coleção)
Alvo: campos que hoje misturam idioma dentro do mesmo documento.

| Coleção | Hoje | Proposta |
|---|---|---|
| `clients` | `name`, `mkt`, `custId` | `nome`, `marketplace`, `proprietarioId` |
| `employees` | `name`, `role` | `nome`, `papel` |
| `tasks` | `cli`, `emp`, `date`, `pri` | `lojaId`, `responsavelId`, `data`, `prioridade` |

**Como fazer com segurança (dupla escrita):**
1. Backend passa a gravar **os dois** nomes por ~2 semanas.
2. Telas passam a ler o novo, com o antigo como reserva.
3. Script de migração preenche o novo nos documentos antigos.
4. Só então o campo antigo é removido.

**Risco:** médio. Reversível em qualquer etapa.

### Fase C — renomear coleções
`integracoes` → `integrations` (ou o inverso: tudo para português).

**Escolha necessária antes:** o padrão será **português** ou **inglês**?
Recomendo **português**, porque o domínio do negócio é em português
(faturamento, comissão, imposto) e a maior parte dos campos novos já está.
Isso significa renomear: `clients`→`lojas`, `customers`→`clientes`,
`employees`→`equipe`, `tasks`→`tarefas`, `sales`→`vendas`.

**Risco:** alto. Exige janela sem uso e migração completa dos documentos.
**Ganho:** apenas interno. O usuário final não vê diferença.

---

## O que NÃO fazer

**Renomear as variáveis curtas do código** (`clis`, `emps`, `tsks`).
Foi avaliado e **descartado**: os nomes naturais colidem com identificadores
que já existem — `lojas` é variável local na tela de Integrações, e
`clientes`/`equipe` são nomes de telas no roteador. O ganho é estético e o
risco é quebrar o sistema em produção. Em vez disso, o mapa de nomes ficou
documentado no topo do arquivo.

---

## Recomendação

Executar a **Fase A** agora (ganho real, risco zero) e deixar B e C para uma
janela planejada — idealmente quando houver um ambiente de teste separado da
produção, que hoje não existe.

Enquanto B e C não acontecem, o `ESQUEMA-DE-DADOS.md` cumpre o papel de
evitar que alguém se perca.
