# Garaje del Usuario

## Descripción
Cada usuario tiene un garaje personal con las guaguas que le han sido asignadas. Puede ver la lista y los detalles técnicos de cada una.

## Actores
- **Usuario autenticado**

## Flujo: Ver Garaje
1. El usuario navega a `/garage` desde el Dashboard
2. El sistema muestra una grilla con todas las guaguas del usuario
3. Cada tarjeta muestra: modelo, generación, apodo, color, torque, peso, combustible, marchas

## Flujo: Ver Detalle de Guagua
1. El usuario hace clic en una guagua de la grilla
2. Navega a `/garage/{id}`
3. Se muestran especificaciones completas: potencia, RPM, dimensiones, powerband, tabla de marchas
4. Opción de acceder al Taller de Tuning

## Rutas
| Método | Ruta | Controlador | Descripción |
|--------|------|-------------|-------------|
| GET | `/garage` | `GarageController@index` | Lista del garaje |
| GET | `/garage/{bus}` | `GarageController@show` | Detalle de guagua |

## Archivos Relacionados
- `app/Http/Controllers/GarageController.php`
- `app/Models/User.php` — relación `garage()` (BelongsToMany)
- `app/Models/BusCatalog.php` — catálogo de guaguas
- `resources/js/Pages/Garage/Index.vue`
- `resources/js/Pages/Garage/Show.vue`

## Modelo de Datos
### Tabla `user_garage` (pivot)
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `user_id` | FK → users | Dueño |
| `bus_id` | FK → buses_catalog | Guagua |
| `nickname` | string(64) | Apodo personalizado |
| `paint_hex` | char(7) | Color (hex) |
| `current_fuel_liters` | smallint | Combustible actual |
| `acquired_at` | timestamp | Fecha de adquisición |

### Tabla `buses_catalog`
Contiene todas las especificaciones técnicas reales de cada modelo:
- Mitsubishi Rosa (BE4, BE6, BE7)
- Toyota Coaster (B20, B40/50, B60/70)
- Marcopolo Volare (A-Series, W-Series, Fly/V-Series)

## Reglas de Negocio
- Un usuario no puede tener la misma guagua duplicada (unique `user_id` + `bus_id`)
- El garaje es de solo lectura — la asignación se hace desde Admin
- Cada guagua tiene un tanque de combustible con capacidad limitada
