# Gasolinera — Recargar Combustible

## Descripción
Los usuarios pueden recargar el tanque de combustible de sus guaguas usando su saldo de billetera virtual.

## Actores
- **Usuario autenticado** con al menos una guagua en su garaje

## Flujo: Recargar Combustible
1. El usuario navega a `/gas-station` desde el Dashboard
2. Ve su saldo de billetera y la lista de guaguas con nivel de combustible actual
3. Para cada guagua se muestra una barra de combustible y botones de recarga (+5L, +10L, +25L, llenar tanque, cantidad custom)
4. El usuario selecciona la cantidad a recargar
5. El sistema valida:
   - Saldo suficiente en billetera
   - No exceder capacidad del tanque
6. Se descuenta el costo del saldo y se actualiza el combustible
7. La UI se actualiza sin recargar la página

## Rutas
| Método | Ruta | Controlador | Descripción |
|--------|------|-------------|-------------|
| GET | `/gas-station` | `GasStationController@index` | Vista de gasolinera |
| POST | `/gas-station/refuel` | `GasStationController@refuel` | Procesar recarga |

## Parámetros POST `/gas-station/refuel`
```json
{
    "garage_id": 1,
    "liters": 10
}
```

## Archivos Relacionados
- `app/Http/Controllers/GasStationController.php`
- `resources/js/Pages/GasStation.vue`

## Reglas de Negocio
- Precio por litro configurable (pasado como prop desde el controller)
- No se puede recargar más allá de la capacidad del tanque
- El saldo de billetera debe ser suficiente para cubrir el costo
- El combustible se mide en litros enteros
