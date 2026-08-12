"""Add machine-required PDF/UA metadata and meaningful link descriptions.

Chromium owns the semantic structure tree. This bounded finishing pass retains
that tree while adding the PDF/UA identification packet and annotation text
that Chromium's tagged-PDF generator does not currently expose.
"""

from pathlib import Path
import sys

import pikepdf
from pikepdf import ContentStreamInstruction, Name, Operator, parse_content_stream, unparse_content_stream


PDF_PATH = Path(sys.argv[1] if len(sys.argv) > 1 else "public/michael-vasandani-resume.pdf")

with pikepdf.open(PDF_PATH, allow_overwriting_input=True) as pdf:
    with pdf.open_metadata(set_pikepdf_as_editor=False) as metadata:
        metadata["dc:title"] = "Michael Sagar Vasandani — Public Résumé"
        metadata["dc:language"] = ["en"]
        metadata["pdfuaid:part"] = "1"

    for page in pdf.pages:
        instructions = list(parse_content_stream(page))
        finished = []
        marked_depth = 0
        loose_run = False

        for instruction in instructions:
            operation = str(instruction.operator)
            if operation in ("BDC", "BMC"):
                if loose_run:
                    finished.append(ContentStreamInstruction([], Operator("EMC")))
                    loose_run = False
                marked_depth += 1
            elif operation == "EMC":
                marked_depth -= 1

            paints = operation in {"Tj", "TJ", "'", '"', "Do", "S", "s", "f", "F", "f*", "B", "B*", "b", "b*", "sh"}
            if paints and marked_depth == 0 and not loose_run:
                finished.append(ContentStreamInstruction([Name("/Artifact")], Operator("BMC")))
                loose_run = True

            finished.append(instruction)

        if loose_run:
            finished.append(ContentStreamInstruction([], Operator("EMC")))
        page.Contents = pdf.make_stream(unparse_content_stream(finished))

        for annotation in page.get("/Annots", []):
            link = annotation
            if link.get("/Subtype") != pikepdf.Name("/Link"):
                continue
            action = link.get("/A", {})
            destination = str(action.get("/URI", "linked destination"))
            link["/Contents"] = f"Open {destination}"

    pdf.save(PDF_PATH)
