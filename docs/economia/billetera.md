# Billetera del Usuario

## Descripción
Sistema de moneda virtual que permite a los usuarios comprar combustible y futuros servicios del juego.

## Actores
- **Usuario autenticado**

## Estado Actual
- Cada usuario tiene un campo `wallet_balance` (decimal, default 0)
- El saldo se muestra en el Dashboard y en la Gasolinera
- El saldo se descuenta al recargar combustible
- No existe aún mecanismo para ganar saldo (pendiente: recompensas por carreras)

## Modelo de Datos
### Tabla `users`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `wallet_balance` | decimal(10,2) | Saldo virtual del usuario |

## Transacciones
| Acción | Efecto en Billetera |
|--------|---------------------|
| Recargar combustible | Resta `liters × price_per_liter` |
| (Futuro) Ganar carrera | Suma recompensa |
| (Futuro) Comprar tuning | Resta costo |

## Archivos Relacionados
- `database/migrations/2026_04_19_000003_add_wallet_and_fuel_columns.php`
- `app/Http/Controllers/GasStationController.php` — descuenta saldo
- `resources/js/Pages/GasStation.vue` — muestra saldo
- `resources/js/Pages/Dashboard.vue` — muestra saldo

## Reglas de Negocio
- El saldo nunca puede ser negativo
- Las transacciones son atómicas (usando transacciones de BD)
- El precio por litro se define en el controller (configurable)
