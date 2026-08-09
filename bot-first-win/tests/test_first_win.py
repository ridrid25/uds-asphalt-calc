"""Проверки «Первой победы». Запуск: python -m pytest -q (из bot-first-win/)."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from first_win import insight
from first_win.fallback import build_fallback_first_win
from first_win.formatting import TELEGRAM_LIMIT, render_first_win
from first_win.models import BusinessSnapshot

GROWING = BusinessSnapshot(
    revenue=2_400_000, expenses=1_850_000, cash=760_000,
    receivables=430_000, prev_revenue=2_100_000, owner_name="Ирина",
)
OVERDUE = BusinessSnapshot(
    revenue=1_800_000, expenses=1_620_000, cash=210_000,
    receivables=940_000, overdue_receivables=610_000, prev_revenue=1_750_000,
)
LOSS = BusinessSnapshot(
    revenue=900_000, expenses=1_150_000, cash=180_000, prev_revenue=1_050_000,
)
EMPTY = BusinessSnapshot(revenue=0, expenses=0, cash=0)

ALL_CASES = [GROWING, OVERDUE, LOSS, EMPTY]


# ── расчёты ───────────────────────────────────────────────────────────────

def test_метрики_считаются():
    assert GROWING.profit == 550_000
    assert GROWING.margin == pytest.approx(22.9, abs=0.1)
    assert GROWING.growth == pytest.approx(14.3, abs=0.1)
    assert GROWING.runway_days == 12


def test_деление_на_ноль_не_ломает():
    assert EMPTY.margin is None
    assert EMPTY.growth is None
    assert EMPTY.runway_days is None


# ── локальный расчёт ──────────────────────────────────────────────────────

@pytest.mark.parametrize("snapshot", ALL_CASES)
def test_локальный_расчёт_даёт_все_четыре_поля(snapshot):
    win = build_fallback_first_win(snapshot)
    for field in (win.positive, win.observation, win.risk, win.action_today):
        assert field and field.strip()
    assert win.source == "fallback"


@pytest.mark.parametrize("snapshot", ALL_CASES)
def test_первый_факт_не_про_провал(snapshot):
    """Главное правило продукта: начинаем с опоры даже в убыточном месяце."""
    positive = build_fallback_first_win(snapshot).positive.lower()
    assert not any(w in positive for w in ("убыт", "просроч", "катастроф", "провал"))


def test_просроченная_дебиторка_попадает_в_риск_с_действием():
    win = build_fallback_first_win(OVERDUE)
    assert "610 000" in win.risk
    assert "позвоните" in win.action_today.lower()


def test_убыток_важнее_мелкой_просрочки():
    """У LOSS просрочка всего 40 000, а дыра — 250 000. В риск идёт дыра."""
    win = build_fallback_first_win(LOSS)
    assert "250 000" in win.risk
    assert "40 000" not in win.risk


def test_убыток_описан_по_русски():
    """Маржа отрицательная — фраза «остаётся минус N рублей» недопустима."""
    observation = build_fallback_first_win(LOSS).observation
    assert "остаётся -" not in observation
    assert "уходит" in observation


# ── текст сообщения ───────────────────────────────────────────────────────

@pytest.mark.parametrize("snapshot", ALL_CASES)
def test_сообщение_собирается_целиком_и_влезает_в_телеграм(snapshot):
    win = build_fallback_first_win(snapshot)
    text = render_first_win(win, snapshot.owner_name)
    for part in (win.positive, win.observation, win.risk, win.action_today):
        assert part in text
    assert len(text) <= TELEGRAM_LIMIT


def test_порядок_блоков_хороший_сначала():
    win = build_fallback_first_win(GROWING)
    text = render_first_win(win)
    assert text.index(win.positive) < text.index(win.observation) < text.index(win.risk)


def test_имя_подставляется_если_известно():
    assert render_first_win(build_fallback_first_win(GROWING), "Ирина").startswith("Ирина,")
    assert render_first_win(build_fallback_first_win(GROWING)).startswith("Я посмотрел")


# ── обращение к Claude: подмена клиента, без сети ─────────────────────────

def _fake_response(*, stop_reason="end_turn", text=None):
    blocks = [SimpleNamespace(type="text", text=text)] if text is not None else []
    return SimpleNamespace(stop_reason=stop_reason, content=blocks)


def _patch_client(monkeypatch, behaviour):
    """behaviour(**kwargs) -> ответ или исключение."""
    captured: dict = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        return behaviour(**kwargs)

    monkeypatch.setattr(
        insight, "_client",
        lambda timeout: SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(create=fake_create))),
    )
    return captured


def test_ответ_модели_разбирается(monkeypatch):
    payload = json.dumps({
        "positive": "Выручка выросла на 14%.",
        "observation": "Маржа держится на 23%.",
        "risk": "Кассы хватит на 12 дней.",
        "action_today": "Посмотрите три крупнейших расхода.",
    })
    _patch_client(monkeypatch, lambda **_: _fake_response(text=payload))

    win = insight.analyze_first_impression(GROWING)
    assert win.source == "claude"
    assert win.positive == "Выручка выросла на 14%."
    assert win.action_today == "Посмотрите три крупнейших расхода."


def test_запрос_собран_правильно(monkeypatch):
    """Модель, кэш системного промпта и схема ответа — то, на чём всё держится."""
    payload = json.dumps({"positive": "а", "observation": "б", "risk": "в", "action_today": "г"})
    captured = _patch_client(monkeypatch, lambda **_: _fake_response(text=payload))

    insight.analyze_first_impression(GROWING)

    assert captured["model"] == "claude-opus-5"
    assert captured["system"][0]["cache_control"] == {"type": "ephemeral"}
    schema = captured["output_config"]["format"]["schema"]
    assert schema["required"] == ["positive", "observation", "risk", "action_today"]
    assert schema["additionalProperties"] is False
    # Цифры клиента идут после точки кэширования, иначе кэш обнулялся бы.
    assert "2400000" in captured["messages"][0]["content"]


@pytest.mark.parametrize("behaviour, why", [
    (lambda **_: (_ for _ in ()).throw(RuntimeError("сеть недоступна")), "исключение"),
    (lambda **_: _fake_response(stop_reason="refusal"), "отказ классификатора"),
    (lambda **_: _fake_response(text="не json"), "битый ответ"),
    (lambda **_: _fake_response(), "пустой ответ"),
])
def test_любой_сбой_не_ломает_первое_впечатление(monkeypatch, behaviour, why):
    _patch_client(monkeypatch, behaviour)
    win = insight.analyze_first_impression(GROWING)
    assert win.source == "fallback", why
    assert win.positive and win.action_today
