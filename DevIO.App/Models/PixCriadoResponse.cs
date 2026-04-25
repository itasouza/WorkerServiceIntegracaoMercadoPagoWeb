namespace DevIO.App.Models;

public class PixCriadoResponse
{
    public long? Id { get; set; }
    public string? Status { get; set; }
    public string? StatusDetail { get; set; }
    public decimal? TransactionAmount { get; set; }
    public string? CodigoMensagem { get; set; }
    public string? MensagemUsuario { get; set; }
    public bool ExibirDocumentoIdentidade { get; set; }
    public string? QrCode { get; set; }
    public string? QrCodeBase64 { get; set; }
    public string? TicketUrl { get; set; }
}
