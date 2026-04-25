/**
 * Checkout de teste — Mercado Pago.js v2 + POST /api/pagamentos/cobranca.
 * Depende de: <script src="https://sdk.mercadopago.com/js/v2"></script> antes deste arquivo.
 */
(function initMercadoPagoCheckout() {
  const publicKeyFallback = "TEST-3a73d898-6ca2-48db-a8e0-0ff09cf3023d";

  /** Vários BINs retornam débito + crédito; results[0] pode ser débito e gerar bin_not_found no pagamento. */
  function escolherMetodoCartaoCredito(results) {
    if (!results || !results.length) return null;
    const tipo = (r) => r.payment_type_id || r.paymentTypeId;
    const cred = results.filter((r) => tipo(r) === "credit_card");
    if (cred.length) return cred[0];
    return results[0];
  }

  function setupMercadoPago(mp) {
    const moneyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

    const cardNumberElement = mp.fields.create("cardNumber", { placeholder: "Número do cartão" }).mount("form-checkout__cardNumber");
    mp.fields.create("expirationDate", { placeholder: "MM/AA" }).mount("form-checkout__expirationDate");
    const securityCodeElement = mp.fields
      .create("securityCode", { placeholder: "CVV 3 dígitos (ex. 123)" })
      .mount("form-checkout__securityCode");

    const paymentMethodElement = document.getElementById("paymentMethodId");
    const issuerElement = document.getElementById("form-checkout__issuer");
    const installmentsElement = document.getElementById("form-checkout__installments");
    const issuerPlaceholder = "Banco emissor";
    const installmentsPlaceholder = "Parcelas";
    let currentBin;

    function updateCartDisplay() {
      const v = parseFloat(String(document.getElementById("transactionAmount").value).replace(",", ".")) || 0;
      const t = moneyFmt.format(v);
      document.getElementById("cart-line").textContent = t;
      document.getElementById("cart-total").textContent = t;
    }
    document.getElementById("transactionAmount").addEventListener("input", updateCartDisplay);

    (async function getIdentificationTypes() {
      try {
        const identificationTypes = await mp.getIdentificationTypes();
        const identificationTypeElement = document.getElementById("form-checkout__identificationType");
        createSelectOptions(identificationTypeElement, identificationTypes);
        const cpf = [...identificationTypeElement.options].find((o) => o.value === "CPF" || o.textContent === "CPF");
        if (cpf) identificationTypeElement.value = cpf.value;
      } catch (e) {
        console.error("identificationTypes:", e);
      }
    })();

    function createSelectOptions(elem, options, labelsAndKeys = { label: "name", value: "id" }) {
      const { label, value } = labelsAndKeys;
      elem.options.length = 0;
      const frag = document.createDocumentFragment();
      options.forEach((option) => {
        const opt = document.createElement("option");
        opt.value = option[value];
        opt.textContent = option[label];
        frag.appendChild(opt);
      });
      elem.appendChild(frag);
    }

    function clearHTMLSelectChildrenFrom(element) {
      [...element.children].forEach((c) => c.remove());
    }

    function createSelectElementPlaceholder(element, placeholder) {
      const optionElement = document.createElement("option");
      optionElement.textContent = placeholder;
      optionElement.setAttribute("selected", "");
      optionElement.setAttribute("disabled", "");
      element.appendChild(optionElement);
    }

    function clearSelectsAndSetPlaceholders() {
      clearHTMLSelectChildrenFrom(issuerElement);
      createSelectElementPlaceholder(issuerElement, issuerPlaceholder);
      clearHTMLSelectChildrenFrom(installmentsElement);
      createSelectElementPlaceholder(installmentsElement, installmentsPlaceholder);
    }

    createSelectElementPlaceholder(issuerElement, issuerPlaceholder);
    createSelectElementPlaceholder(installmentsElement, installmentsPlaceholder);

    cardNumberElement.on("binChange", async (data) => {
      const { bin } = data;
      try {
        if (!bin && paymentMethodElement.value) {
          clearSelectsAndSetPlaceholders();
          paymentMethodElement.value = "";
        }
        if (bin && bin !== currentBin) {
          const { results } = await mp.getPaymentMethods({ bin });
          const paymentMethod = escolherMetodoCartaoCredito(results);
          if (!paymentMethod) return;
          paymentMethodElement.value = paymentMethod.id;
          const { settings } = paymentMethod;
          if (settings && settings[0]) {
            cardNumberElement.update({ settings: settings[0].card_number });
            if (settings[0].security_code) {
              securityCodeElement.update({ settings: settings[0].security_code });
            }
          }
          await updateIssuer(paymentMethod, bin);
          await updateInstallments(paymentMethod, bin);
        }
        currentBin = bin;
      } catch (e) {
        console.error("getPaymentMethods:", e);
      }
    });

    async function updateIssuer(paymentMethod, bin) {
      const { additional_info_needed, issuer } = paymentMethod;
      let issuerOptions = [issuer].filter(Boolean);
      if (additional_info_needed && additional_info_needed.includes("issuer_id")) {
        const { id: paymentMethodId } = paymentMethod;
        issuerOptions = (await mp.getIssuers({ paymentMethodId, bin })) || [];
      }
      if (issuerOptions.length) {
        createSelectOptions(issuerElement, issuerOptions);
      } else {
        clearHTMLSelectChildrenFrom(issuerElement);
        createSelectElementPlaceholder(issuerElement, issuerPlaceholder);
      }
    }

    async function updateInstallments(paymentMethod, bin) {
      try {
        const amount = document.getElementById("transactionAmount").value;
        const list = await mp.getInstallments({
          amount,
          bin,
          paymentTypeId: "credit_card"
        });
        const installmentOptions = list[0] && list[0].payer_costs;
        if (!installmentOptions) return;
        createSelectOptions(installmentsElement, installmentOptions, { label: "recommended_message", value: "installments" });
      } catch (e) {
        console.error("getInstallments:", e);
      }
    }

    document.getElementById("form-checkout").addEventListener("submit", onPay);

    async function onPay(event) {
      event.preventDefault();
      const form = event.target;
      if (!form.checkValidity()) {
        form.classList.add("was-validated");
        return;
      }

      const out = document.getElementById("out");
      out.textContent = "Gerando token e chamando a API…";

      try {
        const token = await mp.fields.createCardToken({
          cardholderName: document.getElementById("form-checkout__cardholderName").value,
          identificationType: document.getElementById("form-checkout__identificationType").value,
          identificationNumber: document.getElementById("form-checkout__identificationNumber").value
        });

        const installmentsVal = document.getElementById("form-checkout__installments").value;
        const body = {
          token: token.id,
          transactionAmount: parseFloat(
            String(document.getElementById("transactionAmount").value).replace(",", ".")
          ),
          payerEmail: document.getElementById("form-checkout__email").value.trim(),
          description: "Pedido de teste",
          installments: parseInt(installmentsVal, 10) || 1,
          payerIdentificationType: document.getElementById("form-checkout__identificationType").value,
          payerIdentificationNumber: document.getElementById("form-checkout__identificationNumber").value.replace(/\D/g, "")
        };

        let paymentMethodId = paymentMethodElement.value.trim();
        const bin6 = extrairBin6(token, currentBin);
        if (!paymentMethodId && bin6.length === 6) {
          const { results } = await mp.getPaymentMethods({ bin: bin6 });
          const pm = escolherMetodoCartaoCredito(results);
          if (pm && pm.id) paymentMethodId = pm.id;
        }
        if (!paymentMethodId) {
          out.textContent =
            "Não foi identificado o meio de pagamento do cartão. Digite pelo menos os 6 primeiros dígitos e aguarde o reconhecimento do cartão antes de pagar.";
          out.classList.add("border-danger", "text-danger");
          return;
        }
        body.paymentMethodId = paymentMethodId;
        // issuer_id omitido no POST: o backend não repassa ao MP (evita bin_not_found com BIN do token).

        const res = await fetch("/api/pagamentos/cobranca", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body)
        });
        const text = await res.text();
        if (text) {
          try {
            const j = JSON.parse(text);
            if (res.ok) {
              out.textContent = "Pagamento criado (HTTP " + res.status + ")\n" + JSON.stringify(j, null, 2);
              out.classList.remove("border-danger");
              out.classList.add("border-success", "text-success");
            } else {
              const msg =
                j.detail || j.title || j.Message || j.message || JSON.stringify(j, null, 2);
              out.textContent = "Falha HTTP " + res.status + ":\n" + msg;
              out.classList.remove("border-success");
              out.classList.add("border-danger", "text-danger");
              // O Chrome mostra "Failed to load resource" no Console para qualquer status != 2xx;
              // o detalhe real do MP está em `msg` e abaixo (sem o token do cartão).
              console.warn("[pagamento-teste] POST /api/pagamentos/cobranca → HTTP " + res.status, {
                motivo: msg,
                paymentMethodId: body.paymentMethodId,
                installments: body.installments
              });
            }
          } catch {
            out.textContent = res.status + " " + res.statusText + "\n" + text;
            out.classList.add("border-danger", "text-danger");
          }
        } else {
          out.textContent = res.status + " " + res.statusText + " (corpo vazio)";
        }
      } catch (e) {
        console.error(e);
        out.textContent = "Erro: " + formatarErroJs(e);
        out.classList.add("border-danger", "text-danger");
      }
    }

    function extrairBin6(token, binFromEvent) {
      const fromToken =
        token &&
        (token.first_six_digits || token.firstSixDigits);
      const raw = fromToken != null && fromToken !== "" ? fromToken : binFromEvent || "";
      return String(raw).replace(/\D/g, "").slice(0, 6);
    }

    function formatarErroJs(e) {
      if (e == null) return String(e);
      if (typeof e === "string") return e;
      if (e.message) return e.message;
      if (e.error) {
        if (typeof e.error === "string") return e.error;
        if (e.error.message) return e.error.message;
        try { return JSON.stringify(e.error, null, 2); } catch (x) { return String(x); }
      }
      try { return JSON.stringify(e, null, 2); } catch { return String(Object.prototype.toString.call(e)); }
    }
  }

  fetch("/api/pagamentos/credenciais-cliente")
    .then((r) => (r.ok ? r.json() : Promise.resolve({})))
    .then((data) =>
      setupMercadoPago(new MercadoPago(data.publicKey || publicKeyFallback, { locale: "pt-BR" }))
    )
    .catch((e) => {
      console.warn("credenciais-cliente:", e);
      setupMercadoPago(new MercadoPago(publicKeyFallback, { locale: "pt-BR" }));
    });
})();
