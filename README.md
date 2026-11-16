# QRs Code

Abra `index.html` no navegador. O site usa HTML, CSS e JavaScript e funciona diretamente da pasta do projeto ou em hospedagem estática.

Escolha **Link**, **Texto**, **Imagem** ou **Áudio**, ajuste a aparência e clique em **Gerar QR Code**. Em **Imagem** ou **Áudio**, selecione um arquivo do computador ou celular. O gerador publica o arquivo e cria um QR que abre a imagem ou o áudio no navegador. Se o arquivo já estiver hospedado, selecione **Usar um link público** e cole um endereço que possa ser aberto sem login. O tamanho selecionado define a resolução da imagem baixada em PNG, JPG ou PDF.

## Links públicos de imagem e áudio

O envio público padrão usa o WaifuVault e funciona ao abrir `index.html` ou em hospedagem estática. O link expira em 30 dias. Imagens aceitam PNG, JPG, WebP e GIF até 10 MB. Áudios aceitam MP3, WAV, OGG, Opus, M4A e FLAC até 25 MB. Qualquer pessoa com o QR Code ou o link poderá acessar o arquivo pela internet. [WaifuVault](https://waifuvault.moe/)

### Usar sua conta Cloudinary

Na sua conta Cloudinary, crie um preset de envio **unsigned** com entrega pública, nomes únicos e os formatos de imagem e áudio que deseja admitir. Preencha `qrs-storage-cloud` e `qrs-storage-preset` no `index.html` com o nome do ambiente e o nome do preset. Use apenas esses valores públicos no HTML. Essa configuração direciona os envios públicos à sua conta Cloudinary. [Configuração de envios pelo navegador](https://cloudinary.com/documentation/client_side_uploading)

## API

O botão de geração envia o conteúdo e as opções de **Link** e **Texto** à API pública do QuickChart. A biblioteca Nayuki gera os QR Codes de **Imagem** e **Áudio** e também é usada para a prévia inicial, para alterações de aparência e como alternativa quando o QuickChart estiver indisponível.

- [Documentação da API do QuickChart](https://quickchart.io/documentation/qr-codes/)
- [Biblioteca QR Code Generator de Project Nayuki](https://www.nayuki.io/page/qr-code-generator-library)
