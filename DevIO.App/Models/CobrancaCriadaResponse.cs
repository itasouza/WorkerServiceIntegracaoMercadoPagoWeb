namespace DevIO.App.Models;

public class CobrancaCriadaResponse
{
    public long? Id { get; set; }
    public string? Status { get; set; }
    public string? StatusDetail { get; set; }
    public decimal? TransactionAmount { get; set; }
}
