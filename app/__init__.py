import os
from flask import Flask, render_template
from app.extensions import db


def create_app():
    app = Flask(__name__, instance_relative_config=True)

    app.config["SECRET_KEY"] = "chave-desenvolvimento"
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///fintrack.db"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    os.makedirs(app.instance_path, exist_ok=True)

    db.init_app(app)

    from app.models import Category, Transaction
    from app.routes.transactions import transactions_bp

    app.register_blueprint(transactions_bp)

    @app.route("/")
    def home():
        return render_template("index.html")

    return app