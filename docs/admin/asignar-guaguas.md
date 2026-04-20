# Asignar Guaguas a Usuarios (Admin)

## Descripción
Panel administrativo exclusivo para el usuario `dev` que permite asignar o remover guaguas del garaje de cualquier usuario registrado.

## Actores
- **Usuario `dev`** (único con permisos de admin)

## Flujo: Asignar Guagua
1. El usuario `dev` navega a `/admin/assign-buses` desde el Dashboard
2. Ve una tabla con:
   - Filas: todos los usuarios registrados
   - Columnas: todas las guaguas del catálogo
3. Cada celda tiene un checkbox (marcado = el usuario tiene esa guagua)
4. Hace clic en un checkbox vacío
5. Se envía POST con `{ user_id, bus_id, action: 'attach' }`
6. La guagua se agrega al garaje del usuario con valores por defecto:
   - Nickname: `{modelo} {generación}`
   - Color: `#FFB300`
   - Combustible: tanque lleno

## Flujo: Remover Guagua
1. Hace clic en un checkbox marcado
2. Se envía POST con `{ user_id, bus_id, action: 'detach' }`
3. La guagua se elimina del garaje del usuario

## Rutas
| Método | Ruta | Controlador | Descripción |
|--------|------|-------------|-------------|
| GET | `/admin/assign-buses` | `AdminController@assignBuses` | Vista de asignación |
| POST | `/admin/assign-buses` | `AdminController@storeBusAssignment` | Toggle asignación |

## Parámetros POST
```json
{
    "user_id": 1,
    "bus_id": 3,
    "action": "attach"  // o "detach"
}
```

## Autorización
- Gate `admin` definido en `AppServiceProvider`
- Condición: `$user->name === 'dev'`
- Usuarios no-dev reciben HTTP 403

## Archivos Relacionados
- `app/Http/Controllers/AdminController.php`
- `app/Providers/AppServiceProvider.php` — Gate `admin`
- `resources/js/Pages/Admin/AssignBuses.vue`
- `resources/js/Pages/Dashboard.vue` — link visible solo para `dev`
- `routes/web.php` — rutas admin

## Reglas de Negocio
- Solo el usuario `dev` puede acceder
- No se puede duplicar la misma guagua para un usuario
- Al remover una guagua, se elimina del pivot `user_garage`
- La UI actualiza sin recargar (Inertia preserveScroll)
