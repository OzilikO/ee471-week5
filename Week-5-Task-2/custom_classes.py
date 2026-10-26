import re

class Calculator:
    """Object-Oriented Calculator logic reused and enhanced from Week 4."""

    def __init__(self):
        self._current_val = 0.0

    @property
    def current_value(self):
        return self._current_val

    def add(self, value):
        self._current_val += float(value)
        return self._current_val

    def sub(self, value):
        self._current_val -= float(value)
        return self._current_val

    def multiply(self, value):
        self._current_val *= float(value)
        return self._current_val

    def divide(self, value):
        val = float(value)
        if val == 0:
            raise ValueError("Cannot divide by zero.")
        self._current_val /= val
        return self._current_val

    def clear(self):
        self._current_val = 0.0
        return self._current_val

    def compute(self, num1, operator, num2):
        """Computes operation between two numbers."""
        self._current_val = float(num1)
        if operator in ["+", "plus", "add"]:
            return self.add(num2)
        elif operator in ["-", "minus", "subtract"]:
            return self.sub(num2)
        elif operator in ["*", "x", "X", "×", "times", "multiply"]:
            return self.multiply(num2)
        elif operator in ["/", "÷", "over", "divide", "divided by"]:
            return self.divide(num2)
        else:
            raise ValueError(f"Unknown operator: {operator}")


# Map written words to standard tokens and numbers
WORD_TO_NUMBER = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "ten": "10", "point": ".", "dot": "."
}

WORD_TO_OPERATOR = {
    "plus": "+", "add": "+",
    "minus": "-", "subtract": "-",
    "times": "*", "multiplied by": "*", "multiplied": "*", "x": "*",
    "over": "/", "divided by": "/", "divided": "/", "divide": "/",
    "is": "=", "equals": "=", "equal": "="
}

NUMBER_TO_WORD = {
    "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
    "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
    "10": "ten", "11": "eleven", "12": "twelve", "13": "thirteen", "14": "fourteen",
    "15": "fifteen", "16": "sixteen", "17": "seventeen", "18": "eighteen",
    "19": "nineteen", "20": "twenty", "-": "minus", ".": "point"
}

BUTTON_TO_SPEECH = {
    "0": "Zero", "1": "One", "2": "Two", "3": "Three", "4": "Four",
    "5": "Five", "6": "Six", "7": "Seven", "8": "Eight", "9": "Nine",
    ".": "Point",
    "+": "Plus",
    "-": "Minus",
    "*": "Times", "x": "Times",
    "/": "Over", "÷": "Over",
    "=": "Is"
}


def number_to_spoken_words(num):
    """Converts a number (int or float) to spoken English words."""
    try:
        # Check if integer
        if float(num).is_integer():
            n = int(round(float(num)))
            prefix = "minus " if n < 0 else ""
            n = abs(n)
            if str(n) in NUMBER_TO_WORD:
                return prefix + NUMBER_TO_WORD[str(n)]
            return prefix + str(n)
        else:
            # Float with decimal point
            parts = f"{float(num):.2f}".rstrip("0").rstrip(".").split(".")
            int_part = number_to_spoken_words(parts[0])
            dec_words = " ".join([NUMBER_TO_WORD.get(d, d) for d in parts[1]])
            return f"{int_part} point {dec_words}"
    except Exception:
        return str(num)


def parse_voice_command(spoken_text):
    """Parses a recognized voice command into operands and operator.

    Examples:
    - 'Five plus two is' -> num1=5, op='+', num2=2
    - 'Seven minus three is' -> num1=7, op='-', num2=3
    - 'Three times two is' -> num1=3, op='*', num2=2
    - 'Nine over three is' -> num1=9, op='/', num2=3
    """
    clean_text = spoken_text.lower().strip()
    # Normalize punctuation
    clean_text = clean_text.replace(",", " ").replace(".", " point ").replace("?", "")
    tokens = clean_text.split()

    normalized_tokens = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        # Check for multi-word phrases like 'divided by', 'multiplied by'
        if i + 1 < len(tokens) and f"{t} {tokens[i+1]}" in WORD_TO_OPERATOR:
            normalized_tokens.append(WORD_TO_OPERATOR[f"{t} {tokens[i+1]}"])
            i += 2
            continue
        if t in WORD_TO_NUMBER:
            normalized_tokens.append(WORD_TO_NUMBER[t])
        elif t in WORD_TO_OPERATOR:
            normalized_tokens.append(WORD_TO_OPERATOR[t])
        elif re.match(r"^-?\d+(\.\d+)?$", t):
            normalized_tokens.append(t)
        elif t in ["+", "-", "*", "x", "/", "÷", "="]:
            normalized_tokens.append(t)
        i += 1

    # Extract num1, operator, num2
    # Expecting: [num1, op, num2, optional('=')]
    num1_parts = []
    op = None
    num2_parts = []
    has_equals = False

    for tok in normalized_tokens:
        if tok in ["+", "-", "*", "x", "/"]:
            op = tok
        elif tok == "=":
            has_equals = True
        elif op is None:
            num1_parts.append(tok)
        else:
            num2_parts.append(tok)

    if not num1_parts or not op or not num2_parts:
        raise ValueError(f"Could not parse a complete mathematical expression from '{spoken_text}'.")

    num1_str = "".join(num1_parts)
    num2_str = "".join(num2_parts)

    return float(num1_str), op, float(num2_str), clean_text

