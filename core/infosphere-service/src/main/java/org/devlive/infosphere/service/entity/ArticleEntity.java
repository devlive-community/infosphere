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
import javax.persistence.FetchType;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.JoinTable;
import javax.persistence.ManyToOne;
import javax.persistence.Table;

import java.time.Instant;

@Data
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "infosphere_article")
@EntityListeners(value = AuditingEntityListener.class)
public class ArticleEntity
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "title")
    private String title;

    @Column(name = "code")
    private String code;

    @Column(name = "content")
    private String content;

    @Column(name = "published")
    private boolean published;

    @Column(name = "create_time")
    @CreatedDate
    private Instant createTime;

    @Column(name = "update_time")
    @LastModifiedDate
    private Instant updateTime;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinTable(name = "infosphere_user_article_relation",
            joinColumns = @JoinColumn(name = "article_id"),
            inverseJoinColumns = @JoinColumn(name = "user_id"))
    private UserEntity user;

    @Formula(value = "(SELECT COUNT(aa.id) " +
            "FROM infosphere_article_access aa " +
            "LEFT JOIN infosphere_article_access_article_relation aar ON aar.article_id = aa.id " +
            "WHERE aa.id = id)")
    private Long viewCount;
}
