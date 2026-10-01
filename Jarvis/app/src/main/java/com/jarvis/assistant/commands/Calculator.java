package com.jarvis.assistant.commands;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Small recursive-descent calculator: + - * / ^ and parentheses, decimals, unary minus. */
public final class Calculator {
    private final String s;
    private int pos = 0;

    private Calculator(String s) {
        this.s = s;
    }

    public static double eval(String expr) {
        Calculator c = new Calculator(expr.replaceAll("\\s+", ""));
        double v = c.parseExpr();
        if (c.pos < c.s.length()) throw new IllegalArgumentException("Unexpected '" + c.s.charAt(c.pos) + "'");
        if (Double.isNaN(v) || Double.isInfinite(v)) throw new ArithmeticException("Result is not a number");
        return v;
    }

    public static String format(double v) {
        if (v == Math.rint(v) && Math.abs(v) < 1e15) return String.valueOf((long) v);
        return BigDecimal.valueOf(v).setScale(8, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
    }

    private double parseExpr() {
        double v = parseTerm();
        while (pos < s.length()) {
            char c = s.charAt(pos);
            if (c == '+') { pos++; v += parseTerm(); }
            else if (c == '-') { pos++; v -= parseTerm(); }
            else break;
        }
        return v;
    }

    private double parseTerm() {
        double v = parsePower();
        while (pos < s.length()) {
            char c = s.charAt(pos);
            if (c == '*') { pos++; v *= parsePower(); }
            else if (c == '/') {
                pos++;
                double d = parsePower();
                if (d == 0) throw new ArithmeticException("Division by zero");
                v /= d;
            } else break;
        }
        return v;
    }

    private double parsePower() {
        double base = parseUnary();
        if (pos < s.length() && s.charAt(pos) == '^') {
            pos++;
            return Math.pow(base, parsePower());
        }
        return base;
    }

    private double parseUnary() {
        if (pos < s.length()) {
            char c = s.charAt(pos);
            if (c == '-') { pos++; return -parseUnary(); }
            if (c == '+') { pos++; return parseUnary(); }
        }
        return parsePrimary();
    }

    private double parsePrimary() {
        if (pos >= s.length()) throw new IllegalArgumentException("Incomplete expression");
        char c = s.charAt(pos);
        if (c == '(') {
            pos++;
            double v = parseExpr();
            if (pos >= s.length() || s.charAt(pos) != ')') throw new IllegalArgumentException("Missing )");
            pos++;
            return v;
        }
        int start = pos;
        while (pos < s.length() && (Character.isDigit(s.charAt(pos)) || s.charAt(pos) == '.')) pos++;
        if (start == pos) throw new IllegalArgumentException("Unexpected '" + c + "'");
        return Double.parseDouble(s.substring(start, pos));
    }
}
