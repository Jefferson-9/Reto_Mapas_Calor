from rest_framework import serializers

from modules.usuarios.catalogo import ROLES


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, trim_whitespace=True)
    password = serializers.CharField(max_length=256, trim_whitespace=False, write_only=True)


class UsuarioCrearSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=60, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    nombre_completo = serializers.CharField(max_length=120, required=False, allow_blank=True)
    cargo = serializers.CharField(max_length=120, required=False, allow_blank=True)
    rol = serializers.ChoiceField(choices=list(ROLES), required=False, allow_blank=True)
    agencia_id = serializers.IntegerField(required=False, allow_null=True)
    activo = serializers.BooleanField(required=False, default=True)
    password = serializers.CharField(max_length=128, required=False, allow_blank=True, trim_whitespace=False, write_only=True)


class UsuarioActualizarSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=60, required=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    nombre_completo = serializers.CharField(max_length=120, required=False)
    cargo = serializers.CharField(max_length=120, required=False, allow_blank=True)
    rol = serializers.ChoiceField(choices=list(ROLES), required=False)
    agencia_id = serializers.IntegerField(required=False, allow_null=True)
    activo = serializers.BooleanField(required=False)


class PasswordSerializer(serializers.Serializer):
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


class PermisosRolSerializer(serializers.Serializer):
    permisos = serializers.ListField(child=serializers.CharField(max_length=40), allow_empty=True)
