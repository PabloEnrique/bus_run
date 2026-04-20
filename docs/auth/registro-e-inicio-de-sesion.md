# Registro e Inicio de Sesión

## Descripción
Sistema de autenticación simple con nombre de usuario y contraseña. Sin verificación de email.

## Actores
- **Usuario no autenticado (guest)**

## Flujo: Registro
1. El usuario navega a `/register`
2. Completa el formulario: nombre de usuario, contraseña, confirmación de contraseña
3. El sistema valida que el nombre sea único y las contraseñas coincidan
4. Se crea la cuenta con contraseña hasheada (bcrypt)
5. Se inicia sesión automáticamente y redirige al Dashboard

## Flujo: Inicio de Sesión
1. El usuario navega a `/login`
2. Ingresa nombre de usuario y contraseña
3. El sistema valida las credenciales
4. Si son correctas, inicia sesión y redirige al Dashboard
5. Si son incorrectas, muestra error

## Flujo: Cerrar Sesión
1. El usuario presiona "Logout" desde cualquier página autenticada
2. Se destruye la sesión y redirige a `/login`

## Rutas
| Método | Ruta | Controlador | Descripción |
|--------|------|-------------|-------------|
| GET | `/login` | `AuthController@showLogin` | Formulario de login |
| POST | `/login` | `AuthController@login` | Procesar login |
| GET | `/register` | `AuthController@showRegister` | Formulario de registro |
| POST | `/register` | `AuthController@register` | Procesar registro |
| POST | `/logout` | `AuthController@logout` | Cerrar sesión |

## Archivos Relacionados
- `app/Http/Controllers/AuthController.php`
- `app/Http/Requests/LoginRequest.php`
- `app/Http/Requests/RegisterRequest.php`
- `resources/js/Pages/Auth/Login.vue`
- `resources/js/Pages/Auth/Register.vue`

## Reglas de Negocio
- El nombre de usuario debe ser único
- La contraseña se hashea con bcrypt (12 rounds)
- Las rutas de auth solo son accesibles como guest (middleware `guest`)
- Todas las demás rutas requieren autenticación (middleware `auth`)
