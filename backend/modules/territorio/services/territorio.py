"""Jerarquía territorial y ámbito del usuario (filtrado en el servidor: RF-002.02, RF-007.06)."""

from core.exceptions import NoEncontrado

NIVELES = ["provincia", "canton", "parroquia", "barrio"]
# Tolerancia de simplificación (grados) según zoom aproximado del mapa
TOLERANCIAS = {"baja": 0.0006, "media": 0.0002, "alta": 0.00005}


class Jerarquia:
    """Vista en memoria del árbol de zonas vigentes (pocas decenas o cientos de filas)."""

    def __init__(self, zonas):
        self.por_id = {z["id"]: z for z in zonas}
        self.hijos = {}
        for z in zonas:
            if z["zona_superior_id"] in self.por_id:
                self.hijos.setdefault(z["zona_superior_id"], []).append(z["id"])
        self.hojas = {zid for zid in self.por_id if zid not in self.hijos}

    def ancestros(self, zid):
        out = []
        z = self.por_id.get(zid)
        while z and z["zona_superior_id"] in self.por_id:
            z = self.por_id[z["zona_superior_id"]]
            out.append(z["id"])
        return out

    def hojas_de(self, zid):
        if zid in self.hojas:
            return {zid}
        res, pila = set(), [zid]
        while pila:
            for h in self.hijos.get(pila.pop(), []):
                (res.add(h) if h in self.hojas else pila.append(h))
        return res

    def agencia_de_hoja(self, zid):
        """La agencia de una hoja es la suya o la del primer ancestro que la tenga."""
        z = self.por_id[zid]
        while z:
            if z["agencia_id"]:
                return z["agencia_id"]
            z = self.por_id.get(z["zona_superior_id"])
        return None

    def ruta(self, zid):
        return [self.por_id[a] for a in reversed(self.ancestros(zid))] + [self.por_id[zid]]


class ServicioTerritorio:
    def __init__(self, repo):
        self.repo = repo

    def jerarquia(self):
        return Jerarquia(self.repo.arbol())

    def hojas_en_ambito(self, ambito, jer=None):
        jer = jer or self.jerarquia()
        hojas = set(jer.hojas)
        if ambito.agencia_id is not None:
            hojas = {h for h in hojas if jer.agencia_de_hoja(h) == ambito.agencia_id}
        if ambito.zonas_asignadas is not None:
            permitidas = set()
            for z in ambito.zonas_asignadas:
                if z in jer.por_id:
                    permitidas |= jer.hojas_de(z)
            hojas &= permitidas
        return hojas

    def zonas_visibles(self, ambito, jer=None):
        jer = jer or self.jerarquia()
        hojas = self.hojas_en_ambito(ambito, jer)
        vis = set(hojas)
        for h in hojas:
            vis.update(jer.ancestros(h))
        return vis

    def agencias(self):
        return self.repo.agencias()

    def zonas(self, ambito, tipo=None, padre_id=None):
        jer = self.jerarquia()
        vis = self.zonas_visibles(ambito, jer)
        out = []
        for zid in vis:
            z = jer.por_id[zid]
            if tipo and z["tipo_zona"] != tipo:
                continue
            if padre_id and z["zona_superior_id"] != padre_id:
                continue
            out.append({**z, "es_hoja": zid in jer.hojas})
        return sorted(out, key=lambda z: (z["nivel"], z["nombre"]))

    def zona(self, zona_id, ambito):
        jer = self.jerarquia()
        if zona_id not in self.zonas_visibles(ambito, jer):
            raise NoEncontrado()
        return {**jer.por_id[zona_id], "ruta": [{"id": z["id"], "nombre": z["nombre"], "tipo_zona": z["tipo_zona"]} for z in jer.ruta(zona_id)],
                "es_hoja": zona_id in jer.hojas}

    def zona_de_punto(self, lat, lng):
        return self.repo.zona_de_punto(lat, lng)

    def geometrias(self, ids, detalle="media"):
        return self.repo.geometrias(ids, TOLERANCIAS.get(detalle, TOLERANCIAS["media"]))
