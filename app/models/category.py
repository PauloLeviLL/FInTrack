from app.extensions import db


class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)

    name = db.Column(
        db.String(50),
        nullable=False
    )

    type = db.Column(
        db.String(20),
        nullable=False
    )

    transactions = db.relationship(
        "Transaction",
        back_populates="category"
    )