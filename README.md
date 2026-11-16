# QRs Code

Gerador de QR Codes para links, textos, imagens e áudios, feito com HTML, CSS e JavaScript.

[Acesse o QRs Code no Vercel](https://qrscode-one.vercel.app/#gerador)

## Como usar

1. Escolha **Link**, **Texto**, **Imagem** ou **Áudio**. Para imagem ou áudio, envie um arquivo do computador ou celular. Se o arquivo já estiver hospedado, clique em **Usar um link público** e cole um endereço que abra sem login.
2. Ajuste as cores, o estilo e o tamanho. Clique em **Gerar QR Code** e confira a prévia.
3. Escolha **PNG**, **JPG** ou **PDF** e clique em **Baixar QR Code**. O tamanho selecionado define a resolução da imagem exportada.

## Links públicos de imagem e áudio

Ao enviar uma imagem ou um áudio, o gerador cria um link que abre o arquivo diretamente no navegador. Qualquer pessoa com o QR Code ou o endereço pode acessar o arquivo pela internet. O envio público padrão usa o WaifuVault, e o link expira em 30 dias. [WaifuVault](https://waifuvault.moe/)

- **Imagens** em PNG, JPG, WebP ou GIF de até 10 MB.
- **Áudios** em MP3, WAV, OGG, Opus, M4A ou FLAC de até 25 MB.

### Usar sua conta Cloudinary

Na sua conta Cloudinary, crie um preset de envio **unsigned** com entrega pública, nomes únicos e os formatos de imagem e áudio que deseja admitir. Preencha `qrs-storage-cloud` e `qrs-storage-preset` no `index.html` com o nome do ambiente e o nome do preset. Use apenas esses valores públicos no HTML. Essa configuração direciona os envios públicos à sua conta Cloudinary. [Configuração de envios pelo navegador](https://cloudinary.com/documentation/client_side_uploading)

## Executar localmente

Abra `index.html` no navegador. O envio de arquivos para gerar links públicos requer conexão com a internet.

## API

O botão de geração envia o conteúdo e as opções de **Link** e **Texto** à API pública do QuickChart. A biblioteca Nayuki gera os QR Codes de **Imagem** e **Áudio** e também é usada para a prévia inicial, para alterações de aparência e como alternativa quando o QuickChart estiver indisponível.

- [Documentação da API do QuickChart](https://quickchart.io/documentation/qr-codes/)
- [Biblioteca QR Code Generator de Project Nayuki](https://www.nayuki.io/page/qr-code-generator-library)
