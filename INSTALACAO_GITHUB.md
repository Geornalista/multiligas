# MULTILIGAS no GitHub Pages

## Estrutura

```text
MULTILIGAS/
├── index.html
├── fetch-fotmob-multileague.js
├── process-stats-multileague.js
├── update-all.js
├── data/
│   └── app/
└── .github/
    └── workflows/
        └── atualizar-dados.yml
```

## Primeiro teste local

```bash
node fetch-fotmob-multileague.js brasil
node process-stats-multileague.js brasil 2026
```

Para atualização completa:

```bash
node update-all.js
```

## GitHub Actions

O workflow `atualizar-dados.yml` executa `node update-all.js` diariamente às 08:17 no fuso `America/Sao_Paulo`, e também permite execução manual em **Actions > Atualizar dados FotMob > Run workflow**.

O workflow precisa de permissão `contents: write`, já configurada no arquivo.

## GitHub Pages

Publique o branch padrão do repositório a partir da raiz (`/`). O arquivo de entrada é `index.html`.

O dashboard lê `data/app/manifest.json` e os JSON de estatísticas publicados no repositório. O navegador não executa Node.js. O Node.js roda somente no GitHub Actions.

## Observação sobre temporadas

O coletor usa a temporada atualmente selecionada pelo FotMob para cada competição. O `update-all.js` lê essa temporada automaticamente e passa o valor ao processador.
