namespace DevIO.App.Options;

public class MercadoPagoOptions
{
    public const string SectionName = "MercadoPago";

    public string? AccessToken { get; set; }
    public string? PublicKey { get; set; }
    public string? ApplicationName { get; set; }
    public long? UserId { get; set; }
    public string? ApplicationNumber { get; set; }
    public string? Integration { get; set; }
    public string? IntegratedApi { get; set; }
}
