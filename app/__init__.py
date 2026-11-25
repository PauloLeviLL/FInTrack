from flask import Flask


def create_app():
    app = Flask(__name__)

    @app.route("/")
    def home():
        return """
            <h1>FinTrack</h1>
            <p>Seu gerenciamento financeiro começa aqui!</p>
        """

    return app