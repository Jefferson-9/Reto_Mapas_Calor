from django.urls import path

from modules.usuarios import views

urlpatterns = [
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/refresh/", views.RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", views.MeView.as_view(), name="auth-me"),
    path("usuarios/", views.UsuariosView.as_view(), name="usuarios"),
    path("usuarios/oficiales/", views.OficialesView.as_view(), name="usuarios-oficiales"),
    path("usuarios/<int:usuario_id>/", views.UsuarioDetalleView.as_view(), name="usuario-detalle"),
    path("usuarios/<int:usuario_id>/contrasena/", views.UsuarioPasswordView.as_view(), name="usuario-contrasena"),
    path("usuarios/<int:usuario_id>/<str:accion>/", views.UsuarioEstadoView.as_view(), name="usuario-estado"),
    path("roles/", views.RolesView.as_view(), name="roles"),
    path("roles/<str:codigo>/permisos/", views.RolPermisosView.as_view(), name="rol-permisos"),
]
