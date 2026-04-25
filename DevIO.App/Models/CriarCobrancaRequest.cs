using System.ComponentModel.DataAnnotations;

namespace DevIO.App.Models;

public class CriarCobrancaRequest
{
    [Required]
    public string Token { get; set; } = "";

    [Required]
    [Range(0.01, double.MaxValue)]
    public decimal TransactionAmount { get; set; }

    [Required]
    [EmailAddress]
    public string PayerEmail { get; set; } = "";

    public string? Description { get; set; }

    public string? PaymentMethodId { get; set; }

    public string? IssuerId { get; set; }

    public string? PayerIdentificationType { get; set; }

    public string? PayerIdentificationNumber { get; set; }

    [Range(1, 12)]
    public int Installments { get; set; } = 1;

    public string? ExternalReference { get; set; }
}
