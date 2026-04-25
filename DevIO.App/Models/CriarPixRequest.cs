using System.ComponentModel.DataAnnotations;

namespace DevIO.App.Models;

public class CriarPixRequest
{
    [Required]
    [Range(0.01, double.MaxValue)]
    public decimal TransactionAmount { get; set; }

    [Required]
    [EmailAddress]
    public string PayerEmail { get; set; } = "";

    public string? Description { get; set; }

    public string? PayerIdentificationType { get; set; }

    public string? PayerIdentificationNumber { get; set; }

    public string? ExternalReference { get; set; }
}
