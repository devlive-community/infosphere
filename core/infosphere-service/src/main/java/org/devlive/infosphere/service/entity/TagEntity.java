package org.devlive.infosphere.service.entity;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;
import org.hibernate.annotations.Formula;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.EntityListeners;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.Table;

import java.time.Instant;

@Data
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "infosphere_tag")
@EntityListeners(value = AuditingEntityListener.class)
public class TagEntity
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "name")
    private String name;

    @Column(name = "description")
    private String description;

    @Column(name = "code")
    private String code;

    @Column(name = "create_time")
    @CreatedDate
    private Instant createTime;

    @Column(name = "update_time")
    @LastModifiedDate
    private Instant updateTime;

    @Formula(value = "(SELECT COUNT(a.id) " +
            "FROM infosphere_article a " +
            "LEFT JOIN infosphere_tag_article_relation tar ON tar.article_id = a.id " +
            "WHERE a.id = id)")
    private Long articleCount;
}
