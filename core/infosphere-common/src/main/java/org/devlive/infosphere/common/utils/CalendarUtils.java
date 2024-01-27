package org.devlive.infosphere.common.utils;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import static java.util.Calendar.DAY_OF_YEAR;
import static java.util.Calendar.YEAR;
import static java.util.Calendar.getInstance;

public class CalendarUtils
{
    private static String FIRST = "first";
    private static String LAST = "last";

    private CalendarUtils()
    {}

    public static Map<String, Date> getCurrentYearFirstAndLastDate()
    {
        Map<String, Date> map = new ConcurrentHashMap<String, Date>();
        Calendar calendar = getInstance();
        calendar.setTime(new Date());
        calendar.set(Calendar.DAY_OF_YEAR, 1);
        map.put(FIRST, calendar.getTime());
        calendar.add(YEAR, 1);
        calendar.set(DAY_OF_YEAR, -1);
        map.put(LAST, calendar.getTime());
        calendar.clear();
        return map;
    }

    public static List<Date> getRangerAllDays()
    {
        return getRangerAllDays(getCurrentYearFirstDay(), getCurrentYearLastDay());
    }

    public static List<Date> getRangerAllDays(Date startDate, Date endDate)
    {
        Calendar start = getInstance();
        start.setTime(startDate);
        start.set(DAY_OF_YEAR, 0);
        Calendar end = getInstance();
        end.setTime(endDate);
        List<Date> yearDays = new ArrayList<Date>();
        while (endDate.after(start.getTime())) {
            start.add(DAY_OF_YEAR, 1);
            yearDays.add(start.getTime());
        }
        return yearDays;
    }

    /**
     * 获取当年第一天
     *
     * @return 当年第一天
     */
    public static Date getCurrentYearFirstDay()
    {
        Calendar current = getInstance();
        int currentYear = current.get(YEAR);
        return getYearFirstDay(currentYear);
    }

    /**
     * 获取某年第一天日期
     *
     * @param year 年份
     * @return Date
     */
    public static Date getYearFirstDay(int year)
    {
        Calendar calendar = getInstance();
        calendar.clear();
        calendar.set(YEAR, year);
        return calendar.getTime();
    }

    /**
     * 获取当年的最后一天
     *
     * @return 当年最后一天
     */
    public static Date getCurrentYearLastDay()
    {
        Calendar current = Calendar.getInstance();
        int currentYear = current.get(Calendar.YEAR);
        return getYearLastDay(currentYear);
    }

    /**
     * 获取某年最后一天日期
     *
     * @param year 年份
     * @return Date
     */
    public static Date getYearLastDay(int year)
    {
        Calendar calendar = Calendar.getInstance();
        calendar.clear();
        calendar.set(Calendar.YEAR, year);
        calendar.roll(Calendar.DAY_OF_YEAR, -1);
        return calendar.getTime();
    }
}
