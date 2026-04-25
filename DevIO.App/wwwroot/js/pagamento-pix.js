(function initPixCheckout() {
  const form = document.getElementById("form-pix");
  const out = document.getElementById("out");
  const qrImage = document.getElementById("qr-image");
  const qrCopyPaste = document.getElementById("qr-copy-paste");

  form.addEventListener("submit", onSubmit);

  async function onSubmit(event) {
    event.preventDefault();

    const body = {
      transactionAmount: parseFloat(String(document.getElementById("transactionAmount").value).replace(",", ".")),
      payerEmail: document.getElementById("payerEmail").value.trim(),
      description: document.getElementById("description").value.trim(),
      payerIdentificationType: document.getElementById("identificationType").value.trim(),
      payerIdentificationNumber: document.getElementById("identificationNumber").value.replace(/\D/g, "")
    };

    out.textContent = "Criando cobranca PIX...";
    qrImage.style.display = "none";
    qrImage.removeAttribute("src");
    qrCopyPaste.value = "";

    try {
      const res = await fetch("/api/pagamentos/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body)
      });

      const text = await res.text();
      if (!text) {
        out.textContent = "Resposta vazia (" + res.status + ").";
        return;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        out.textContent = "Falha ao interpretar resposta:\n" + text;
        return;
      }

      if (!res.ok) {
        const erro = data.detail || data.title || data.message || JSON.stringify(data, null, 2);
        out.textContent = "Falha HTTP " + res.status + ":\n" + erro;
        return;
      }

      const codigo = data.codigoMensagem || data.CodigoMensagem || "-";
      const mensagem = data.mensagemUsuario || data.MensagemUsuario || "-";
      out.textContent = [
        "PIX criado com sucesso (HTTP " + res.status + ")",
        "Codigo: " + codigo,
        "Mensagem: " + mensagem,
        "Status: " + (data.status || data.Status || "-"),
        "StatusDetail: " + (data.statusDetail || data.StatusDetail || "-"),
        "",
        JSON.stringify(data, null, 2)
      ].join("\n");

      const qrBase64 = data.qrCodeBase64 || data.QrCodeBase64;
      const qrCode = data.qrCode || data.QrCode;
      if (qrBase64) {
        qrImage.src = "data:image/png;base64," + qrBase64;
        qrImage.style.display = "block";
      }
      if (qrCode) {
        qrCopyPaste.value = qrCode;
      }
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      out.textContent = "Erro ao criar PIX: " + msg;
    }
  }
})();
