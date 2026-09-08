"""Calendar & scheduling connectors for production and maintenance planning."""

from shuangan.connectors.calendar.connector import CalendarConnector
from shuangan.connectors.calendar._dingtalk import DingTalkCalendar
from shuangan.connectors.calendar._feishu import FeishuCalendar

# Short public API alias
Calendar = CalendarConnector

__all__ = [
    "Calendar",
    "CalendarConnector",
    "DingTalkCalendar",
    "FeishuCalendar",
]
