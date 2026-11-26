from datetime import date
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request

from app.models import Transaction, Category
from app.extensions import db

transactions_bp = Blueprint(
    "transactions",
    __name__,
    url_prefix="/transactions"
)


@transactions_bp.route("/", methods=["GET"])
def list_transactions():
    query = Transaction.query

    # Filtro por tipo
    transaction_type = request.args.get("type")

    if transaction_type:
        if transaction_type not in ["income", "expense"]:
            return jsonify({
                "error": "Tipo de transação inválido"
            }), 400

        query = query.filter_by(type=transaction_type)

    # Filtro por categoria
    category_id = request.args.get("category_id")

    if category_id:
        try:
            category_id = int(category_id)
        except ValueError:
            return jsonify({
                "error": "ID de categoria inválido"
            }), 400

        category = db.session.get(Category, category_id)

        if not category:
            return jsonify({
                "error": "Categoria não encontrada"
            }), 404

        query = query.filter_by(category_id=category_id)

        # Filtros por mês e ano
    month = request.args.get("month")
    year = request.args.get("year")

    if month or year:
        try:
            current_year = date.today().year

            selected_year = int(year) if year else current_year
            selected_month = int(month) if month else None

            if selected_year < 1900 or selected_year > 2100:
                raise ValueError

            if selected_month and not 1 <= selected_month <= 12:
                raise ValueError

        except ValueError:
            return jsonify({
                "error": "Mês ou ano inválido"
            }), 400

        if selected_month:
            start_date = date(selected_year, selected_month, 1)

            if selected_month == 12:
                end_date = date(selected_year + 1, 1, 1)
            else:
                end_date = date(selected_year, selected_month + 1, 1)

            query = query.filter(
                Transaction.date >= start_date,
                Transaction.date < end_date
            )

        else:
            start_date = date(selected_year, 1, 1)
            end_date = date(selected_year + 1, 1, 1)

            query = query.filter(
                Transaction.date >= start_date,
                Transaction.date < end_date
            )

    # Executa a consulta
    transactions = query.order_by(
        Transaction.date.desc()
    ).all()

    result = []

    for transaction in transactions:
        result.append({
            "id": transaction.id,
            "title": transaction.title,
            "amount": str(transaction.amount),
            "type": transaction.type,
            "date": transaction.date.isoformat(),
            "description": transaction.description,
            "category": transaction.category.name,
            "category_id": transaction.category_id
        })

    return jsonify({"transactions": result})


@transactions_bp.route("/categories", methods=["POST"])
def create_category():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Dados não fornecidos"}), 400

    name = data.get("name")
    category_type = data.get("type")

    if not name or category_type not in ["income", "expense"]:
        return jsonify({
            "error": "Informe um nome e um tipo válido"
        }), 400

    category = Category(
        name=name,
        type=category_type
    )

    db.session.add(category)
    db.session.commit()

    return jsonify({
        "message": "Categoria criada com sucesso!",
        "id": category.id,
        "name": category.name,
        "type": category.type
    }), 201


@transactions_bp.route("/categories", methods=["GET"])
def list_categories():
    categories = Category.query.order_by(
        Category.name.asc()
    ).all()

    result = []

    for category in categories:
        result.append({
            "id": category.id,
            "name": category.name,
            "type": category.type
        })

    return jsonify({
        "categories": result
    })



@transactions_bp.route("/categories/<int:category_id>", methods=["PUT"])
def update_category(category_id):
    category = db.session.get(Category, category_id)

    if not category:
        return jsonify({
            "error": "Categoria não encontrada"
        }), 404

    data = request.get_json(silent=True)

    if not data:
        return jsonify({
            "error": "Dados não fornecidos"
        }), 400

    if "name" in data:
        name = data["name"]

        if not isinstance(name, str) or not name.strip():
            return jsonify({
                "error": "Nome inválido"
            }), 400

        category.name = name.strip()

    if "type" in data:
        if data["type"] not in ["income", "expense"]:
            return jsonify({
                "error": "Tipo inválido"
            }), 400

        # Não permite mudar o tipo se houver
        # transações associadas à categoria.
        if category.transactions:
            return jsonify({
                "error": "Não é possível alterar o tipo de uma categoria que possui transações"
            }), 400

        category.type = data["type"]

    db.session.commit()

    return jsonify({
        "message": "Categoria atualizada com sucesso!",
        "id": category.id,
        "name": category.name,
        "type": category.type
    }), 200


@transactions_bp.route("/categories/<int:category_id>", methods=["DELETE"])
def delete_category(category_id):
    category = db.session.get(Category, category_id)

    if not category:
        return jsonify({
            "error": "Categoria não encontrada"
        }), 404

    if category.transactions:
        return jsonify({
            "error": "Não é possível excluir uma categoria que possui transações associadas"
        }), 400

    db.session.delete(category)
    db.session.commit()

    return jsonify({
        "message": "Categoria excluída com sucesso!"
    }), 200


@transactions_bp.route("/", methods=["POST"])
def create_transaction():
    data = request.get_json(silent=True)

    if not data:
        return jsonify({"error": "Dados não fornecidos"}), 400

    title = data.get("title")
    transaction_type = data.get("type")
    category_id = data.get("category_id")

    if not title or not title.strip():
        return jsonify({"error": "Informe o título"}), 400

    if transaction_type not in ["income", "expense"]:
        return jsonify({"error": "Tipo de transação inválido"}), 400

    # Validar o valor
    try:
        amount = Decimal(str(data.get("amount")))
        if not amount.is_finite() or amount <= 0:
            raise InvalidOperation
    except (InvalidOperation, TypeError, ValueError):
        return jsonify({"error": "Informe um valor válido"}), 400

    # Validar a categoria
    try:
        category_id = int(category_id)
    except (TypeError, ValueError):
        return jsonify({"error": "Categoria inválida"}), 400

    category = db.session.get(Category, category_id)

    if not category or category.type != transaction_type:
        return jsonify({
            "error": "Categoria não encontrada ou incompatível"
        }), 400

    # Validar a data, caso tenha sido informada
    transaction_date = data.get("date")

    if transaction_date:
        try:
            transaction_date = date.fromisoformat(transaction_date)
        except (TypeError, ValueError):
            return jsonify({"error": "Data inválida"}), 400

    transaction = Transaction(
        title=title.strip(),
        amount=amount,
        type=transaction_type,
        date=transaction_date or date.today(),
        description=data.get("description"),
        category_id=category_id
    )

    db.session.add(transaction)
    db.session.commit()

    return jsonify({
        "message": "Transação criada com sucesso!",
        "id": transaction.id,
        "title": transaction.title,
        "amount": str(transaction.amount),
        "type": transaction.type,
        "date": transaction.date.isoformat(),
        "category": category.name
    }), 201


@transactions_bp.route("/<int:transaction_id>", methods=["PUT"])
def update_transaction(transaction_id):
    transaction = db.session.get(Transaction, transaction_id)

    if not transaction:
        return jsonify({"error": "Transação não encontrada"}), 404

    data = request.get_json(silent=True)

    if not data:
        return jsonify({"error": "Dados não fornecidos"}), 400

    if "title" in data:
        title = data["title"]

        if not isinstance(title, str) or not title.strip():
            return jsonify({"error": "Título inválido"}), 400

        transaction.title = title.strip()

    if "amount" in data:
        try:
            amount = Decimal(str(data["amount"]))

            if not amount.is_finite() or amount <= 0:
                raise InvalidOperation

            transaction.amount = amount

        except (InvalidOperation, TypeError, ValueError):
            return jsonify({"error": "Valor inválido"}), 400

    if "type" in data:
        if data["type"] not in ["income", "expense"]:
            return jsonify({"error": "Tipo inválido"}), 400

        transaction.type = data["type"]

    if "category_id" in data:
        try:
            category_id = int(data["category_id"])
        except (TypeError, ValueError):
            return jsonify({"error": "Categoria inválida"}), 400

        category = db.session.get(Category, category_id)

        if not category:
            return jsonify({"error": "Categoria não encontrada"}), 404

        transaction.category_id = category_id

    # Verifica se a categoria combina com o tipo atualizado
    if transaction.category.type != transaction.type:
        return jsonify({
            "error": "A categoria não corresponde ao tipo da transação"
        }), 400

    if "date" in data:
        try:
            transaction.date = date.fromisoformat(data["date"])
        except (TypeError, ValueError):
            return jsonify({"error": "Data inválida"}), 400

    if "description" in data:
        transaction.description = data["description"]

    db.session.commit()

    return jsonify({
        "message": "Transação atualizada com sucesso!",
        "id": transaction.id,
        "title": transaction.title,
        "amount": str(transaction.amount),
        "type": transaction.type,
        "date": transaction.date.isoformat(),
        "category": transaction.category.name
    }), 200


@transactions_bp.route("/<int:transaction_id>", methods=["DELETE"])
def delete_transaction(transaction_id):
    transaction = db.session.get(Transaction, transaction_id)

    if not transaction:
        return jsonify({
            "error": "Transação não encontrada"
        }), 404

    db.session.delete(transaction)
    db.session.commit()

    return jsonify({
        "message": "Transação excluída com sucesso!"
    }), 200

@transactions_bp.route("/summary", methods=["GET"])
def financial_summary():
    transactions = Transaction.query.all()

    total_income = sum(
        (transaction.amount for transaction in transactions
         if transaction.type == "income"),
        Decimal("0.00")
    )

    total_expense = sum(
        (transaction.amount for transaction in transactions
         if transaction.type == "expense"),
        Decimal("0.00")
    )

    balance = total_income - total_expense

    return jsonify({
        "total_income": str(total_income),
        "total_expense": str(total_expense),
        "balance": str(balance)
    })

@transactions_bp.route("/expenses-by-category", methods=["GET"])
def expenses_by_category():
    query = db.session.query(
        Category.name,
        db.func.sum(Transaction.amount).label("total")
    ).join(
        Category
    ).filter(
        Transaction.type == "expense"
    )

    month = request.args.get("month")
    year = request.args.get("year")

    if month or year:
        try:
            current_year = date.today().year
            selected_year = int(year) if year else current_year
            selected_month = int(month) if month else None

            if selected_year < 1900 or selected_year > 2100:
                raise ValueError

            if selected_month and not 1 <= selected_month <= 12:
                raise ValueError

        except ValueError:
            return jsonify({
                "error": "Mês ou ano inválido"
            }), 400

        if selected_month:
            start_date = date(selected_year, selected_month, 1)

            if selected_month == 12:
                end_date = date(selected_year + 1, 1, 1)
            else:
                end_date = date(selected_year, selected_month + 1, 1)

        else:
            start_date = date(selected_year, 1, 1)
            end_date = date(selected_year + 1, 1, 1)

        query = query.filter(
            Transaction.date >= start_date,
            Transaction.date < end_date
        )

    results = query.group_by(
        Category.id,
        Category.name
    ).all()

    expenses = []

    for category_name, total in results:
        expenses.append({
            "category": category_name,
            "total": str(total)
        })

    return jsonify({
        "expenses_by_category": expenses
    })