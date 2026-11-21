"""Exportadores de reportes detrás de una interfaz común (registro abierto a nuevos formatos)."""

import csv
import io
from abc import ABC, abstractmethod

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


class Exportador(ABC):
    extension = ""
    content_type = ""

    @abstractmethod
    def generar(self, reporte) -> bytes:
        """reporte: {titulo, metadatos: [(etiqueta, valor)], columnas: [str], filas: [[...]], notas: [str]}"""


class ExportadorCSV(Exportador):
    extension = "csv"
    content_type = "text/csv; charset=utf-8"

    def generar(self, reporte):
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow([reporte["titulo"]])
        for k, v in reporte["metadatos"]:
            w.writerow([k, v])
        for n in reporte.get("notas", []):
            w.writerow(["Nota", n])
        w.writerow([])
        w.writerow(reporte["columnas"])
        w.writerows(reporte["filas"])
        return ("﻿" + buf.getvalue()).encode("utf-8")


class ExportadorPDF(Exportador):
    extension = "pdf"
    content_type = "application/pdf"

    def generar(self, reporte):
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
                                title=reporte["titulo"], author="COAC Padre Julián Lorente")
        st = getSampleStyleSheet()
        azul = colors.HexColor("#0f5daa")
        elementos = [Paragraph(f"<font color='#0f5daa'><b>{reporte['titulo']}</b></font>", st["Title"])]
        meta = "<br/>".join(f"<b>{k}:</b> {v}" for k, v in reporte["metadatos"])
        elementos += [Paragraph(meta, st["Normal"]), Spacer(1, 5 * mm)]
        for n in reporte.get("notas", []):
            elementos.append(Paragraph(f"<i>{n}</i>", st["Italic"]))
        elementos.append(Spacer(1, 3 * mm))
        datos = [reporte["columnas"]] + [["" if c is None else str(c) for c in f] for f in reporte["filas"]]
        tabla = Table(datos, repeatRows=1)
        tabla.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), azul), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f1e6")]),
            ("ALIGN", (1, 1), (-1, -1), "RIGHT"), ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d8cfbd")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        elementos.append(tabla)
        doc.build(elementos)
        return buf.getvalue()


EXPORTADORES = {"csv": ExportadorCSV(), "pdf": ExportadorPDF()}
