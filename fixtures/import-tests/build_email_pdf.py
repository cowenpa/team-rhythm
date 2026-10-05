"""Build the two fictional email-chain pages used for import testing."""
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
DESTINATION = PROJECT / "output" / "pdf" / "sample-email-chains.pdf"
DESTINATION.parent.mkdir(parents=True, exist_ok=True)

heading = ParagraphStyle("heading", fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=colors.HexColor("#182d37"), spaceAfter=9)
subheading = ParagraphStyle("subheading", fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#546972"), spaceAfter=14)
body = ParagraphStyle("body", fontName="Helvetica", fontSize=9, leading=11.5, textColor=colors.HexColor("#182d37"))

def footer(canvas, document):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#546972"))
    canvas.drawString(42, 27, "Team Rhythm | Fictional import test | No real personal or client data")
    canvas.drawRightString(A4[0] - 42, 27, str(document.page))
    canvas.restoreState()

story = []
for index, (filename, title) in enumerate([
    ("03-email-deadline-brought-forward.txt", "Email chain: deadline brought forward"),
    ("04-email-deadline-postponed.txt", "Email chain: deadline postponed"),
]):
    if index:
        story.append(PageBreak())
    story.append(Paragraph(title, heading))
    story.append(Paragraph("Source: " + filename + ". Sent dates inside the messages determine the chronology.", subheading))
    for line in (HERE / filename).read_text().splitlines():
        story.append(Paragraph(escape(line), body) if line else Spacer(1, 5))

document = SimpleDocTemplate(str(DESTINATION), pagesize=A4, rightMargin=42, leftMargin=42, topMargin=40, bottomMargin=46, title="Team Rhythm - fictional email import tests", author="Team Rhythm demo")
document.build(story, onFirstPage=footer, onLaterPages=footer)
print(DESTINATION)
