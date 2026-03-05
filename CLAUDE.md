# Benhayon — Regras do Projeto

## Edge Functions — REGRAS OBRIGATÓRIAS

### evolution-webhook (CRÍTICA — NÃO QUEBRE)

Esta função recebe TODOS os webhooks do WhatsApp via Evolution API. Qualquer erro aqui = mensagens perdidas.

**Regras que NUNCA podem ser removidas:**
1. **Filtrar grupos**: `remoteJid.includes('@g.us')` → skip. Sem isso, mensagens de grupo poluem o DB
2. **Filtrar fromMe**: `key.fromMe` → skip. Sem isso, mensagens enviadas duplicam
3. **Exigir paciente**: Lookup na tabela `patients` por `phone`. Se não encontrar → skip. Sem isso, `patient_id` fica null
4. **Try/catch por mensagem**: Cada mensagem no loop tem seu próprio try/catch. Sem isso, uma mensagem com erro mata o processamento das seguintes
5. **Logs estruturados `[webhook]`**: Todo skip e toda ação devem ter console.log com motivo

**Após qualquer mudança nesta função:**
```bash
# OBRIGATÓRIO: rodar o teste e2e antes de dar deploy
./scripts/test-webhook.sh

# Deploy
export $(grep -E '^SUPABASE_ACCESS_TOKEN=' .env | xargs)
npx supabase functions deploy evolution-webhook --project-ref mbrfqgdqbcedoianjrsr

# Rodar teste novamente após deploy
./scripts/test-webhook.sh
```

### Todas as Edge Functions

- **Deploy individual**: Sempre deployar apenas a função modificada, nunca todas de uma vez
- **Testar antes e depois**: Rodar scripts de teste quando disponíveis
- **Nunca remover filtros de segurança** (grupos, fromMe, paciente desconhecido)

## Timestamps e Timezone

- O banco armazena tudo em UTC (`TIMESTAMPTZ`)
- O frontend converte para **America/Sao_Paulo** via `toSaoPaulo()` em `src/lib/formatters.ts`
- **NUNCA** remover a conversão de timezone do `formatDate`. Sem ela, horários aparecem errados para o usuário
- Todas as funções de formatação de data (`formatDate`, `formatDateTime`, `formatMonthYear`) passam por `toSaoPaulo()` automaticamente

## Testes Disponíveis

| Script | O que testa | Quando rodar |
|---|---|---|
| `./scripts/test-webhook.sh` | evolution-webhook e2e (5 cenários) | Antes/depois de deploy do webhook |
