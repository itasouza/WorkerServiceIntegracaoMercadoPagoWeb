using System.Linq;
using DevIO.App.Options;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Configuration.EnvironmentVariables;

var builder = WebApplication.CreateBuilder(args);

// Configuração via appsettings.json (sem fonte de variáveis de ambiente em IConfiguration).
if (builder.Configuration is IConfigurationBuilder configBuilder)
{
    var toRemove = configBuilder.Sources
        .OfType<EnvironmentVariablesConfigurationSource>()
        .ToList();
    foreach (var s in toRemove)
        configBuilder.Sources.Remove(s);
}

builder.Services.Configure<MercadoPagoOptions>(
    builder.Configuration.GetSection(MercadoPagoOptions.SectionName));

// AccessToken e demais chaves: section "MercadoPago" em appsettings.json.

// Add services to the container.

builder.Services.AddHttpClient();
builder.Services.AddControllers();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseAuthorization();

app.MapControllers();

app.Run();
