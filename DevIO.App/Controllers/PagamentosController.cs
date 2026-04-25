using DevIO.App.Models;
using DevIO.App.Options;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace DevIO.App.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PagamentosController : ControllerBase
    {
        private readonly MercadoPagoOptions _mp;
        private readonly IHttpClientFactory _httpClientFactory;

        public PagamentosController(IOptions<MercadoPagoOptions> options, IHttpClientFactory httpClientFactory)
        {
            _mp = options.Value;
            _httpClientFactory = httpClientFactory;
        }

        /// <summary>Public Key do appsettings — mesma aplicação do Access Token usado em /cobranca.</summary>
        [HttpGet("credenciais-cliente")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public IActionResult CredenciaisCliente()
        {
            if (string.IsNullOrWhiteSpace(_mp.PublicKey))
                return NotFound(new { message = "Configure MercadoPago:PublicKey no appsettings." });
            return Ok(new { publicKey = _mp.PublicKey.Trim() });
        }

        [HttpPost("cobranca")]
        [ProducesResponseType(typeof(CobrancaCriadaResponse), StatusCodes.Status201Created)]
        public async Task<IActionResult> CriarCobranca(
            [FromBody] CriarCobrancaRequest body,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(_mp.AccessToken))
                return Problem("Configure MercadoPago:AccessToken no appsettings.", statusCode: (int)HttpStatusCode.ServiceUnavailable);

            if (!ModelState.IsValid)
                return ValidationProblem(ModelState);

            var accessToken = _mp.AccessToken.Trim();

            var r1 = await CriarPagamentoNaApiMpAsync(body, accessToken, comPaymentMethodId: true, cancellationToken);
            if (r1.Ok && r1.Resposta != null)
                return StatusCode(StatusCodes.Status201Created, r1.Resposta);

            if (r1.BinNotFound && !string.IsNullOrWhiteSpace(body.PaymentMethodId))
            {
                var r2 = await CriarPagamentoNaApiMpAsync(body, accessToken, comPaymentMethodId: false, cancellationToken);
                if (r2.Ok && r2.Resposta != null)
                    return StatusCode(StatusCodes.Status201Created, r2.Resposta);
                return Problem(detail: r2.CorpoErro ?? r2.CorpoBruto, statusCode: (int)HttpStatusCode.BadRequest);
            }

            return Problem(detail: r1.CorpoErro ?? r1.CorpoBruto, statusCode: (int)HttpStatusCode.BadRequest);
        }

        private static Dictionary<string, object?> MontarJsonPagamento(CriarCobrancaRequest body, bool comPaymentMethodId)
        {
            var payer = new Dictionary<string, object?> { ["email"] = body.PayerEmail.Trim() };
            if (!string.IsNullOrWhiteSpace(body.PayerIdentificationType) &&
                !string.IsNullOrWhiteSpace(body.PayerIdentificationNumber))
            {
                payer["identification"] = new Dictionary<string, object?>
                {
                    ["type"] = body.PayerIdentificationType.Trim(),
                    ["number"] = body.PayerIdentificationNumber.Trim()
                };
            }

            var root = new Dictionary<string, object?>
            {
                ["transaction_amount"] = (double)body.TransactionAmount,
                ["token"] = body.Token.Trim(),
                ["description"] = string.IsNullOrWhiteSpace(body.Description) ? "Pedido" : body.Description.Trim(),
                ["installments"] = body.Installments,
                ["payer"] = payer
            };

            if (!string.IsNullOrWhiteSpace(body.ExternalReference))
                root["external_reference"] = body.ExternalReference.Trim();

            if (comPaymentMethodId && !string.IsNullOrWhiteSpace(body.PaymentMethodId))
                root["payment_method_id"] = body.PaymentMethodId.Trim().ToLowerInvariant();

            return root;
        }

        private async Task<(
            bool Ok,
            CobrancaCriadaResponse? Resposta,
            string? CorpoBruto,
            string? CorpoErro,
            bool BinNotFound)> CriarPagamentoNaApiMpAsync(
            CriarCobrancaRequest body,
            string accessToken,
            bool comPaymentMethodId,
            CancellationToken cancellationToken)
        {
            var json = JsonSerializer.Serialize(MontarJsonPagamento(body, comPaymentMethodId));

            using var req = new HttpRequestMessage(System.Net.Http.HttpMethod.Post, "https://api.mercadopago.com/v1/payments");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            req.Headers.TryAddWithoutValidation("X-Idempotency-Key", Guid.NewGuid().ToString("N"));
            req.Content = new StringContent(json, Encoding.UTF8, "application/json");

            var http = _httpClientFactory.CreateClient();
            using var resp = await http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            var texto = await resp.Content.ReadAsStringAsync(cancellationToken);

            if (resp.StatusCode == HttpStatusCode.Created)
            {
                try
                {
                    using var doc = JsonDocument.Parse(texto);
                    var root = doc.RootElement;
                    var status = root.TryGetProperty("status", out var st) ? st.GetString() : null;
                    var statusDetail = root.TryGetProperty("status_detail", out var sd) ? sd.GetString() : null;
                    var infoMensagem = MapearMensagemUsuario(status, statusDetail);
                    var resposta = new CobrancaCriadaResponse
                    {
                        Id = root.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.Number
                            ? idEl.GetInt64()
                            : null,
                        Status = status,
                        StatusDetail = statusDetail,
                        TransactionAmount = root.TryGetProperty("transaction_amount", out var ta) && ta.ValueKind == JsonValueKind.Number
                            ? ta.GetDecimal()
                            : null,
                        CodigoMensagem = infoMensagem.Codigo,
                        MensagemUsuario = infoMensagem.Mensagem,
                        ExibirDocumentoIdentidade = infoMensagem.ExibirDocumentoIdentidade
                    };
                    return (true, resposta, texto, null, false);
                }
                catch
                {
                    return (false, null, texto, texto, false);
                }
            }

            var binNotFound = texto.Contains("bin_not_found", StringComparison.OrdinalIgnoreCase);
            string? detalhe;
            try
            {
                using var err = JsonDocument.Parse(texto);
                detalhe = JsonSerializer.Serialize(new { Message = "Error response from API.", StatusCode = (int)resp.StatusCode, apiError = err.RootElement });
            }
            catch
            {
                detalhe = texto;
            }

            return (false, null, texto, detalhe, binNotFound);
        }

        private static (string Codigo, string Mensagem, bool ExibirDocumentoIdentidade) MapearMensagemUsuario(
            string? status,
            string? statusDetail)
        {
            var detail = (statusDetail ?? string.Empty).Trim().ToLowerInvariant();
            var st = (status ?? string.Empty).Trim().ToLowerInvariant();

            if (st == "approved")
                return ("APRO", "Pagamento aprovado", true);

            if (st.StartsWith("pending", StringComparison.Ordinal))
                return ("CONT", "Pagamento pendente", false);

            return detail switch
            {
                "cc_rejected_call_for_authorize" => ("CALL", "Recusado com validação para autorizar", false),
                "cc_rejected_insufficient_amount" => ("FUND", "Recusado por quantia insuficiente", false),
                "cc_rejected_bad_filled_security_code" => ("SECU", "Recusado por código de segurança inválido", false),
                "cc_rejected_bad_filled_date" => ("EXPI", "Recusado por problema com a data de vencimento", false),
                "cc_rejected_bad_filled_card_number" => ("FORM", "Recusado por erro no formulário", false),
                "cc_rejected_bad_filled_other" => ("FORM", "Recusado por erro no formulário", false),
                "cc_rejected_bad_filled_cardholder_name" => ("FORM", "Recusado por erro no formulário", false),
                "cc_rejected_bad_filled_document_number" => ("FORM", "Recusado por erro no formulário", false),
                _ => ("OTHE", "Recusado por erro geral", true)
            };
        }

        ////MercadoPagoApiException com bin_not_found não é um bug do C# em si: é a API do Mercado Pago recusando o POST /v1/payments com HTTP 400. O SDK só repassa essa falha como exceção na linha do CreateAsync.
        ////Em geral isso aparece quando o BIN do cartão no token não bate com o que a API inferiu a partir de payment_method_id, issuer_id ou combinação inválida para o ambiente de testes.
    }
}